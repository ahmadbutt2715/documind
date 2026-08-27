from django.shortcuts import get_object_or_404, redirect, render
from .models import Conversation
from .models import Conversation, Message
import json
from django.http import StreamingHttpResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from .services import get_ai_reply_stream
from .models import Conversation, Message


# /chat 
def chat(request, conversation_id=None):
    conversations = Conversation.objects.all()      # load all chats to display in sidebar using Conversatio model

    conversation = None
    messages = []

    if conversation_id:
        conversation = get_object_or_404(Conversation, id=conversation_id)      # get current conversation history from db
        messages = conversation.messages.all()

    return render(request, "chat/chat.html", {
        "conversations": conversations,
        "conversation": conversation,
        "messages": messages,
    })



# User input

@login_required
@require_POST
def send_message(request):
    body = json.loads(request.body)
    conversation_id = body.get("conversation_id")
    text = body.get("message", "").strip()

    if not text:
        return JsonResponse({"error": "Empty message"}, status=400)

    if conversation_id:
        conversation = Conversation.objects.get(id=conversation_id)
    else:
        conversation = Conversation.objects.create(title=text[:50])

    Message.objects.create(conversation=conversation, role="user", content=text)

    def event_stream():
        # Sent first so the frontend can adopt the new conversation id immediately
        meta = {"conversation_id": str(conversation.id), "title": conversation.title}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

        full_reply = ""
        for token in get_ai_reply_stream(conversation.thread_id, text):
            full_reply += token
            yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"

        Message.objects.create(conversation=conversation, role="assistant", content=full_reply)
        yield "event: done\ndata: {}\n\n"

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # relevant only if deployed behind nginx
    return response