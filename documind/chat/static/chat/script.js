document.addEventListener("DOMContentLoaded", () => {
    const textarea = document.querySelector(".input-container textarea");
    const sendBtn = document.querySelector(".send-btn");
    const messagesContainer = document.querySelector(".messages");
    const newChatBtn = document.querySelector(".new-chat");
    const searchInput = document.querySelector(".chat-search input");
    const conversationEls = document.querySelectorAll(".conversation");
    const sidebar = document.querySelector(".sidebar");
    const collapseBtn = document.querySelector(".collapse-btn");
    const expandBtn = document.querySelector(".expand-btn");

    const fileInput = document.getElementById("file-input");
    const attachBtn = document.getElementById("attach-btn");
    const attachedContainer = document.getElementById("attached-document-container");

    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;

        isUploading = true;
        sendBtn.disabled = true;
        showAttachedChip(file.name, "Uploading...", true);   // loading = true, no remove button, spinner shown

        const formData = new FormData();
        formData.append("file", file);
        if (currentConversationId) {
            formData.append("conversation_id", currentConversationId);
        }

        try {
            const response = await fetch("/chat/upload/", {
                method: "POST",
                headers: { "X-CSRFToken": getCookie("csrftoken") },
                body: formData,
            });

            if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
            const data = await response.json();

            showAttachedChip(data.filename, "PDF");   // loading = false → spinner replaced with icon + remove button

            if (!currentConversationId) {
                currentConversationId = data.conversation_id;
                history.pushState({}, "", `/chat/${data.conversation_id}/`);
                prependConversationToSidebar(data.conversation_id, data.title);
            }
        } catch (err) {
            showAttachedChip(file.name, "Upload failed — try again");
            console.error(err);
        } finally {
            fileInput.value = "";
            isUploading = false;
            sendBtn.disabled = false;
        }
    });

    function showAttachedChip(filename, statusText, loading = false) {
        attachedFilename = filename;

        const truncated = filename.length > 28 ? filename.slice(0, 25) + "…" : filename;

        const iconHtml = loading
            ? `<div class="attached-pill-spinner"></div>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>`;

        attachedContainer.innerHTML = `
            <div class="attached-pill">
                <div class="attached-pill-icon">
                    ${iconHtml}
                </div>
                <div class="attached-pill-text">
                    <strong></strong>
                    <span></span>
                </div>
                ${loading ? "" : `<button type="button" class="attached-pill-remove" title="Remove">×</button>`}
            </div>
        `;

        attachedContainer.querySelector("strong").textContent = truncated;
        attachedContainer.querySelector("span").textContent = statusText;

        const removeBtn = attachedContainer.querySelector(".attached-pill-remove");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                attachedContainer.innerHTML = "";
                attachedFilename = null;
            });
        }
    }

    // Single source of truth for the active conversation id
    let currentConversationId = JSON.parse(
        document.getElementById("conversation-id-data").textContent
    );

    let attachedFilename = null;
    let isUploading = false;

    // ---------- Sidebar search ----------
    searchInput.addEventListener("input", function () {
        const term = this.value.toLowerCase();
        conversationEls.forEach((c) => {
            const name = c.querySelector(".conversation-name").textContent.toLowerCase();
            c.style.display = name.includes(term) ? "" : "none";
        });
    });

    // ---------- Sidebar collapse/expand ----------
    collapseBtn.addEventListener("click", () => {
        sidebar.classList.add("collapsed");
        expandBtn.classList.add("visible");
    });

    expandBtn.addEventListener("click", () => {
        sidebar.classList.remove("collapsed");
        expandBtn.classList.remove("visible");
    });

    // ---------- New Chat ----------
    newChatBtn.addEventListener("click", (e) => {
        e.preventDefault();

        currentConversationId = null; // now correctly resets the ONLY variable sendMessage() uses

        messagesContainer.innerHTML = `
            <div class="welcome">
                <div class="welcome-icon">D</div>
                <h1>How can I help you?</h1>
                <p>Ask questions about your documents, summarize content, or explore information with DocuMind.</p>
            </div>
        `;

        document.querySelectorAll(".conversation.active")
            .forEach((c) => c.classList.remove("active"));

        history.pushState({}, "", "/chat/");
    });

    // ---------- Helpers ----------
    function getCookie(name) {
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return match ? decodeURIComponent(match[2]) : null;
    }

    function removeWelcome() {
        const welcome = messagesContainer.querySelector(".welcome");
        if (welcome) welcome.remove();
    }

    function renderUserMessage(text, attachmentName = null) {
        if (attachmentName) {
            const attachmentRow = document.createElement("div");
            attachmentRow.className = "message-row user-row";
            attachmentRow.innerHTML = `
                <div class="attached-pill attached-pill-inline">
                    <div class="attached-pill-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <div class="attached-pill-text">
                        <strong></strong>
                        <span>PDF</span>
                    </div>
                </div>
            `;
            const truncated = attachmentName.length > 28 ? attachmentName.slice(0, 25) + "…" : attachmentName;
            attachmentRow.querySelector("strong").textContent = truncated;
            messagesContainer.appendChild(attachmentRow);
        }

        if (!text) return;   // don't render an empty text bubble

        const row = document.createElement("div");
        row.className = "message-row user-row";
        row.innerHTML = `<div class="message user-message"></div>`;
        row.querySelector(".message").textContent = text;
        messagesContainer.appendChild(row);
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function prependConversationToSidebar(id, title) {
        const conversationsContainer = document.querySelector(".conversations .conversation-section");

        // Remove "no chats yet" placeholder if present
        const emptyMsg = conversationsContainer.querySelector(".no-conversations");
        if (emptyMsg) emptyMsg.remove();

        // Un-highlight any currently active conversation
        document.querySelectorAll(".conversation.active")
            .forEach((c) => c.classList.remove("active"));

        const link = document.createElement("a");
        link.href = `/chat/${id}/`;
        link.className = "conversation active";
        link.innerHTML = `
            <span class="conversation-icon">◌</span>
            <span class="conversation-name"></span>
            <span class="more">•••</span>
        `;
        link.querySelector(".conversation-name").textContent = title;

        // Insert at the top, after the "Chats" section title
        const sectionTitle = conversationsContainer.querySelector(".section-title");
        sectionTitle.insertAdjacentElement("afterend", link);
    }


    

    // ---------- Send message ----------
    function createAssistantMessageShell() {
        const row = document.createElement("div");
        row.className = "message-row assistant-row";
        row.innerHTML = `
            <div class="assistant-content">
                <div class="assistant-message"></div>
            </div>
        `;
        messagesContainer.appendChild(row);
        return row.querySelector(".assistant-message");
    }

    async function sendMessage() {
        if (isUploading) return;

        const text = textarea.value.trim();
        if (!text && !attachedFilename) return;   // allow sending with just an attachment

        removeWelcome();
        renderUserMessage(text, attachedFilename);

        attachedContainer.innerHTML = "";
        attachedFilename = null;

        textarea.value = "";
        textarea.style.height = "auto";
        scrollToBottom();

        sendBtn.disabled = true;
        const contentEl = createAssistantMessageShell();
        let fullText = "";

        try {
            const response = await fetch("/chat/send/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCookie("csrftoken"),
                },
                body: JSON.stringify({
                    conversation_id: currentConversationId,
                    message: text,   // can be an empty string now
                }),
            });

            if (!response.ok || !response.body) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const parts = buffer.split("\n\n");
                buffer = parts.pop(); // last part may be incomplete — keep for next read

                for (const part of parts) {
                    if (!part.trim()) continue;

                    let eventType = "message";
                    let data = "";
                    for (const line of part.split("\n")) {
                        if (line.startsWith("event:")) eventType = line.slice(6).trim();
                        if (line.startsWith("data:")) data = line.slice(5).trim();
                    }
                    if (!data) continue;

                    const parsed = JSON.parse(data);

                    if (eventType === "meta") {
                        if (!currentConversationId) {
                            currentConversationId = parsed.conversation_id;
                            history.pushState({}, "", `/chat/${parsed.conversation_id}/`);
                            prependConversationToSidebar(parsed.conversation_id, parsed.title);
                        }
                    } else if (eventType === "token") {
                        fullText += parsed.token;
                        const rawHtml = marked.parse(fullText);
                        contentEl.innerHTML = DOMPurify.sanitize(rawHtml);
                        scrollToBottom();
                    } else if (eventType === "done") {
                        contentEl.querySelectorAll("pre code").forEach((block) => {
                            hljs.highlightElement(block);
                        });
                    }
                }
            }
        } catch (err) {
            contentEl.textContent = "Something went wrong. Please try again.";
            console.error("Stream failed:", err);
        } finally {
            sendBtn.disabled = false;
        }
    }

    sendBtn.addEventListener("click", sendMessage);

    textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
    });

    document.querySelectorAll(".assistant-message pre code").forEach((block) => {
        hljs.highlightElement(block);
    });
});