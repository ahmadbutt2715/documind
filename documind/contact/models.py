from django.db import models


TOPIC_CHOICES = [
    ("product", "A question about DocuMind"),
    ("feedback", "Product feedback"),
    ("collaboration", "A collaboration idea"),
    ("other", "Something else"),
]


class ContactMessage(models.Model):
    name = models.CharField(max_length=150)
    email = models.EmailField()
    topic = models.CharField(max_length=40, choices=TOPIC_CHOICES, default="product")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} <{self.email}>"