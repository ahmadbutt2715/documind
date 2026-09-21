from django import forms

from .models import ContactMessage


class ContactMessageForm(forms.ModelForm):
    class Meta:
        model = ContactMessage
        fields = ["name", "email", "topic", "message"]
        widgets = {
            "name": forms.TextInput(attrs={
                "autocomplete": "name",
                "placeholder": "Jane Smith",
            }),
            "email": forms.EmailInput(attrs={
                "autocomplete": "email",
                "placeholder": "jane@example.com",
            }),
            "topic": forms.Select(),
            "message": forms.Textarea(attrs={
                "rows": 5,
                "placeholder": "Tell us what is on your mind...",
            }),
        }
        labels = {
            "name": "Your name",
            "email": "Email address",
            "topic": "What can we help with?",
            "message": "Your message",
        }
