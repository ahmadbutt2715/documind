from django.shortcuts import get_object_or_404, redirect, render
from .models import Conversation
from .models import Conversation, Message
import json
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from .services import get_ai_reply
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

    # thread_id must be a string — LangGraph expects str, Django gives you an int
    thread_id = str(conversation.id)

    Message.objects.create(conversation=conversation, role="user", content=text)

    reply_text = get_ai_reply(thread_id, text)

    Message.objects.create(conversation=conversation, role="assistant", content=reply_text)

    return JsonResponse({
        "conversation_id": conversation.id,
        "title": conversation.title,
        "reply": reply_text,
    })