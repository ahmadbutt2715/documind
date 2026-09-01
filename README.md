# DocuMind

DocuMind is an AI-powered chat application built with Django and LangGraph. It lets users have streaming, multi-turn conversations with an AI assistant that has access to web search, a calculator, and Retrieval-Augmented Generation (RAG) over PDF documents uploaded during the conversation.

## Features

- **Real-time streaming responses** — AI replies are streamed token-by-token via Server-Sent Events (SSE), so users see the answer as it's generated instead of waiting for the full response.
- **Document-aware chat (RAG)** — Upload a PDF to a conversation and ask questions about it. The document is chunked, embedded, and stored in a per-conversation FAISS vector store, retrievable via a dedicated `rag_tool`.
- **Tool-using AI agent** — Built on LangGraph, the assistant can call:
  - `web_search` — live web search via DuckDuckGo
  - `calculator` — performs basic arithmetic (`+`, `-`, `*`, `/`) on two numbers
  - `rag_tool` — retrieval over any PDF uploaded in the current conversation
- **Persistent conversation memory** — Powered by LangGraph's `PostgresSaver` checkpointer, keyed per-conversation via a `thread_id`, so the AI retains context across messages in the same chat.
- **Markdown rendering with syntax highlighting** — AI responses render as sanitized, formatted markdown (via `marked.js` + `DOMPurify` client-side, and `python-markdown` + `bleach` for server-rendered history) with syntax-highlighted code blocks (`highlight.js`).
- **Multi-user support** — Full authentication (signup/login/logout) with per-user conversation isolation; users can only see and access their own chats.
- **Lazy conversation creation** — Conversations are only persisted to the database once a message or document is actually sent — clicking "New Chat" or attaching a file doesn't create clutter until there's real content.
- **Responsive, collapsible sidebar UI** — Searchable conversation list, collapsible sidebar, and a ChatGPT-style interface built with vanilla HTML/CSS/JS (no frontend framework).

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | Django 5.2 |
| AI orchestration | LangGraph |
| LLM | Google Gemini (`gemini-flash-lite-latest`) via `langchain-google-genai` |
| Embeddings | Google Generative AI Embeddings |
| Vector store | FAISS (local, per-conversation) |
| Conversation memory | PostgreSQL, via LangGraph's `PostgresSaver` + `psycopg_pool` |
| Database (app data) | PostgreSQL |
| Frontend | Vanilla HTML/CSS/JavaScript (no framework) |
| Markdown rendering | `marked.js` + `DOMPurify` (client), `python-markdown` + `bleach` (server) |
| Syntax highlighting | `highlight.js` |
| Package management | `uv` |

## Project Structure

```
documind/
├── documind/           # Project settings, root urls.py
├── accounts/           # Authentication (signup, login, logout)
│   ├── views.py
│   ├── urls.py
│   └── templates/accounts/
├── chat/                # Core chat app
│   ├── models.py        # Conversation, Message, Document models
│   ├── views.py          # chat, send_message, upload_document, discard_conversation
│   ├── services.py      # LangGraph graph, tools, RAG ingestion, streaming
│   ├── urls.py
│   ├── static/chat/      # chat.css, script.js
│   └── templates/chat/   # chat.html
├── vectorstores/         # Per-conversation FAISS indexes (gitignored)
├── media/                # Uploaded PDF files (gitignored)
└── manage.py
```

## Data Model

- **Conversation** — belongs to a `user`; has a `title`, a unique `thread_id` (used to key LangGraph's checkpointer memory), `created_at`/`updated_at`.
- **Message** — belongs to a `Conversation`; has a `role` (`user`/`assistant`), `content`, and an optional link to an attached `Document`.
- **Document** — an uploaded PDF, linked to a `Conversation` and optionally to the `Message` it was attached to.

## How It Works

1. **Sending a message**: The frontend calls `POST /chat/send/` with the conversation ID (or `null` for a new chat) and the message text. The backend lazily creates a `Conversation` if needed, saves the user's message, and streams the AI's reply back via SSE, using the conversation's `thread_id` to maintain LangGraph memory.
2. **Uploading a document**: The frontend calls `POST /chat/upload/` with the PDF file. The backend saves the file, loads and splits it into chunks, embeds them, and stores them in a FAISS index at `vectorstores/<thread_id>/`. The next message sent in that conversation includes a system note informing the AI that a document is available, so it can decide to invoke `rag_tool`.
3. **RAG retrieval**: When the AI calls `rag_tool`, it retrieves the current `thread_id` from the LangGraph run config, loads that conversation's FAISS index, and returns the most relevant chunks for the query.

## Setup

### Prerequisites

- Python 3.11+
- PostgreSQL database
- A Google API key (for Gemini chat + embeddings)

### Installation

```bash
# Clone and enter the project
cd documind

# Install dependencies
uv sync
```

### Environment variables

Create a `.env` file in the project root:

```
GOOGLE_API_KEY=your_google_api_key
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=your_db_host
DB_PORT=5432
```

### Database setup

```bash
python manage.py migrate
python manage.py createsuperuser
```

### Run the development server

```bash
python manage.py runserver
```

Visit `http://127.0.0.1:8000/accounts/signup/` to create an account, or `http://127.0.0.1:8000/admin/` to log in with a superuser.

## Known Limitations

- The `calculator` tool only performs a single operation (`+`, `-`, `*`, `/`) between exactly two numbers at a time — it can't evaluate multi-step expressions like `(5 + 3) * 2` in one call. For compound math, the model needs to chain multiple tool calls sequentially, which works but is slower than a single expression evaluator.
- FAISS vector stores are stored as local files (`vectorstores/`), which doesn't scale across multiple server instances. A future migration to `pgvector`/Postgres-backed vector storage is planned.
- No automated cleanup for conversations where a document is uploaded but never followed up with a message — currently relies on the user manually removing the attachment before sending.

## Roadmap / Ideas

- Migrate FAISS to `pgvector` for a unified Postgres-backed storage layer.
- Support multiple documents per conversation with clearer per-document attribution in responses.
- Add a scheduled cleanup job for orphaned, message-less conversations.
- Support additional file types beyond PDF (e.g. `.docx`, `.txt`).
- Extend the calculator tool to support multi-step expressions via a safe expression parser (e.g. Python's `ast` module), without reintroducing arbitrary code execution.