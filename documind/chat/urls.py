from django.urls import path
from . import views

urlpatterns = [
    path("", views.chat, name="chat"),
    path("send/", views.send_message, name="send_message"),     # (API) end point for sending query to chatbot, only callable using js fetch()
    path("<uuid:conversation_id>/", views.chat, name="chat_detail"),
]