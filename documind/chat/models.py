import uuid
from django.db import models
from django.conf import settings


def generate_thread_id():
    return uuid.uuid4().hex


class Conversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversations")
    title = models.CharField(max_length=255, default="New Chat")
    thread_id = models.CharField(max_length=64, unique=True, editable=False, default=generate_thread_id)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]          # when I query about this model, by default sort by updated_at descending

    def __str__(self):
        return self.title


class Message(models.Model):
    ROLE_CHOICES = [("user", "User"), ("assistant", "Assistant")]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    document = models.ForeignKey(
        "Document", on_delete=models.SET_NULL, null=True, blank=True, related_name="messages"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.role}: {self.content[:40]}"

    @property
    def rendered_content(self):
        from .services import render_markdown_safe
        return render_markdown_safe(self.content)


class Document(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="documents")
    file = models.FileField(upload_to="uploads/%Y/%m/%d/")
    original_name = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_name