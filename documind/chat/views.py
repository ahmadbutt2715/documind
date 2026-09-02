from django.shortcuts import get_object_or_404, redirect, render
from .models import Conversation
from .models import Conversation, Message, Document
import json
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from .services import get_ai_reply_stream
from .services import ingest_pdf


# /chat 
@login_required
def chat(request, conversation_id=None):
    conversations = Conversation.objects.filter(user=request.user)      # load all chats to display in sidebar using Conversatio model

    conversation = None
    messages = []

    if conversation_id:
        conversation = get_object_or_404(Conversation, id=conversation_id, user=request.user)      # get current conversation history from db
        messages = conversation.messages.all()

    return render(request, "chat/chat.html", {
        "conversations": conversations,
        "conversation": conversation,
        "messages": messages,
    })



# API
@login_required
@require_POST
def send_message(request):
    body = json.loads(request.body)
    conversation_id = body.get("conversation_id")
    text = body.get("message", "").strip()

    if conversation_id:
        conversation = Conversation.objects.get(id=conversation_id, user=request.user)
    else:
        title = text[:50] if text else "New chat"
        conversation = Conversation.objects.create(user=request.user, title=title)

    pending_doc = conversation.documents.filter(messages__isnull=True).first()

    if not text and not pending_doc:
        return JsonResponse({"error": "Empty message"}, status=400)

    user_message = Message.objects.create(conversation=conversation, role="user", content=text)

    llm_input_text = text
    image_path = None

    if pending_doc:
        user_message.document = pending_doc
        user_message.save()

        if pending_doc.file_type == "image":
            image_path = pending_doc.file.path
            llm_input_text = text or "Describe this image."
        else:
            # existing PDF-note logic unchanged
            if text:
                llm_input_text = (
                    f'[System note: the user has attached a document named "{pending_doc.original_name}" '
                    f'to this conversation. Use the rag_tool if their message relates to it.]\n\n{text}'
                )
            else:
                llm_input_text = (
                    f'[System note: the user attached a document named "{pending_doc.original_name}"] '
                )

    def event_stream():
        meta = {"conversation_id": str(conversation.id), "title": conversation.title}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

        full_reply = ""
        for token in get_ai_reply_stream(conversation.thread_id, llm_input_text, image_path=image_path):
            full_reply += token
            yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"

        Message.objects.create(conversation=conversation, role="assistant", content=full_reply)
        yield "event: done\ndata: {}\n\n"

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# API
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")
PDF_EXTENSIONS = (".pdf",)

@login_required
@require_POST
def upload_document(request):
    conversation_id = request.POST.get("conversation_id")
    uploaded_file = request.FILES.get("file")

    if not uploaded_file:
        return JsonResponse({"error": "No file provided"}, status=400)

    filename_lower = uploaded_file.name.lower()
    is_pdf = filename_lower.endswith(PDF_EXTENSIONS)
    is_image = filename_lower.endswith(IMAGE_EXTENSIONS)

    if not (is_pdf or is_image):
        return JsonResponse({"error": "Only PDF or image files (png, jpg, webp, gif) are supported"}, status=400)

    if conversation_id:
        conversation = Conversation.objects.get(id=conversation_id, user=request.user)
    else:
        conversation = Conversation.objects.create(user=request.user, title=uploaded_file.name[:50])

    document = Document.objects.create(
        conversation=conversation,
        file=uploaded_file,
        original_name=uploaded_file.name,
        file_type="image" if is_image else "pdf",   # <-- new field, see note below
    )

    if is_pdf:
        try:
            ingest_pdf(document.file.path, conversation.thread_id)
        except Exception as e:
            return JsonResponse({"error": f"Failed to process document: {e}"}, status=500)
    # images need no ingestion step — they get passed directly to the LLM as multimodal content when the next message is sent

    return JsonResponse({
        "conversation_id": str(conversation.id),
        "title": conversation.title,
        "filename": document.original_name,
        "file_type": document.file_type,
    })