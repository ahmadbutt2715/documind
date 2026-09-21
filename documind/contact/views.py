from django.contrib import messages
from django.shortcuts import redirect, render

from contact.forms import ContactMessageForm


def contact(request):
    if request.method == "POST":
        form = ContactMessageForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, "Your message was sent successfully.", extra_tags="contact")
            return redirect("contact")
    else:
        form = ContactMessageForm()

    return render(request, "contact/contact.html", {"form": form})