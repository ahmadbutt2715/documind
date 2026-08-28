from django.urls import path
from . import views

urlpatterns = [
    path("", views.chat, name="chat"),
    path("send/", views.send_message, name="send_message"),     # (API) endpoint for sending query to chatbot, only callable using js fetch()
    path("<uuid:conversation_id>/", views.chat, name="chat_detail"),
    path("upload/", views.upload_document, name="upload_document"),
]