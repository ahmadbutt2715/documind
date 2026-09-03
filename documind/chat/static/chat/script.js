document.addEventListener("DOMContentLoaded", () => {
    const textarea = document.querySelector(".input-container textarea");
    const sendBtn = document.querySelector(".send-btn");
    const messagesContainer = document.querySelector(".messages");
    const chatContent = document.querySelector(".chat-content");           // NEW — actual scrollable element
    const scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn"); // NEW
    const newChatBtn = document.querySelector(".new-chat");
    const searchInput = document.querySelector(".chat-search input");
    const conversationEls = document.querySelectorAll(".conversation");
    const sidebar = document.querySelector(".sidebar");
    const collapseBtn = document.querySelector(".collapse-btn");
    const expandBtn = document.querySelector(".expand-btn");

    const fileInput = document.getElementById("file-input");
    const attachBtn = document.getElementById("attach-btn");
    const attachedContainer = document.getElementById("attached-document-container");

    const inputArea = document.querySelector(".input-area");
    const chatEl = document.querySelector(".chat");

    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;

        isUploading = true;
        sendBtn.disabled = true;
        showAttachedChip(file.name, "Uploading...", true);

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

            showAttachedChip(data.filename, "PDF");

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

    let currentConversationId = JSON.parse(
        document.getElementById("conversation-id-data").textContent
    );

    let attachedFilename = null;
    let isUploading = false;

    // ---------- NEW: scroll-to-bottom button logic ----------
    const SCROLL_BOTTOM_THRESHOLD = 80; // px from bottom still counted as "at bottom"
    let autoScrollEnabled = true;       // keep following new content unless user scrolls up

    function isNearBottom() {
        return chatContent.scrollHeight - chatContent.scrollTop - chatContent.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
    }

    function isScrollable() {
        return chatContent.scrollHeight > chatContent.clientHeight + 1;
    }

    function updateScrollBtnVisibility() {
        const shouldShow = isScrollable() && !isNearBottom();
        scrollToBottomBtn.classList.toggle("visible", shouldShow);
    }

    function scrollToBottom(smooth = false) {
        chatContent.scrollTo({
            top: chatContent.scrollHeight,
            behavior: smooth ? "smooth" : "auto",
        });
    }

    // User scrolled manually: stop auto-following if they moved away from bottom,
    // resume it if they scrolled back down themselves.
    chatContent.addEventListener("scroll", () => {
        autoScrollEnabled = isNearBottom();
        updateScrollBtnVisibility();
    });

    // Clicking the button always jumps to bottom and resumes auto-follow.
    scrollToBottomBtn.addEventListener("click", () => {
        autoScrollEnabled = true;
        scrollToBottom(true);
        updateScrollBtnVisibility();
    });

    // Content height changes constantly while tokens stream in — catch every
    // change here instead of scattering scrollToBottom() calls everywhere.
    const resizeObserver = new ResizeObserver(() => {
        if (autoScrollEnabled) {
            scrollToBottom();
        }
        updateScrollBtnVisibility();
    });
    resizeObserver.observe(messagesContainer);

    window.addEventListener("resize", updateScrollBtnVisibility);
    updateScrollBtnVisibility(); // initial state on page load
    // ---------- end new block ----------

    searchInput.addEventListener("input", function () {
        const term = this.value.toLowerCase();
        conversationEls.forEach((c) => {
            const name = c.querySelector(".conversation-name").textContent.toLowerCase();
            c.style.display = name.includes(term) ? "" : "none";
        });
    });

    collapseBtn.addEventListener("click", () => {
        sidebar.classList.add("collapsed");
        expandBtn.classList.add("visible");
    });

    expandBtn.addEventListener("click", () => {
        sidebar.classList.remove("collapsed");
        expandBtn.classList.remove("visible");
    });

    newChatBtn.addEventListener("click", (e) => {
        e.preventDefault();

        currentConversationId = null;

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
        updateScrollBtnVisibility(); // NEW — hide button on a fresh, empty chat
    });

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

        if (!text) return;

        const row = document.createElement("div");
        row.className = "message-row user-row";
        row.innerHTML = `<div class="message user-message"></div>`;
        row.querySelector(".message").textContent = text;
        messagesContainer.appendChild(row);
    }

    function prependConversationToSidebar(id, title) {
        const conversationsContainer = document.querySelector(".conversations .conversation-section");

        const emptyMsg = conversationsContainer.querySelector(".no-conversations");
        if (emptyMsg) emptyMsg.remove();

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

        const sectionTitle = conversationsContainer.querySelector(".section-title");
        sectionTitle.insertAdjacentElement("afterend", link);
    }

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
        if (!text && !attachedFilename) return;

        removeWelcome();
        renderUserMessage(text, attachedFilename);

        attachedContainer.innerHTML = "";
        attachedFilename = null;

        textarea.value = "";
        textarea.style.height = "auto";

        // Sending a message should always land the user at the bottom,
        // and keep following the reply as it streams in.
        autoScrollEnabled = true;                 // NEW
        scrollToBottom();                          // CHANGED — was messagesContainer-based, now correct

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
                    message: text,
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
                buffer = parts.pop();

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

                        const chatTitleEl = document.getElementById("chat-title");
                        if (chatTitleEl) {
                            const titleText = chatTitleEl.querySelector("strong");
                            if (titleText) titleText.textContent = parsed.title;
                            chatTitleEl.style.display = "";
                        }
                    } else if (eventType === "token") {
                        fullText += parsed.token;
                        const rawHtml = marked.parse(fullText);
                        contentEl.innerHTML = DOMPurify.sanitize(rawHtml);
                        // NEW: no manual scrollToBottom() call here anymore —
                        // the ResizeObserver on messagesContainer handles it,
                        // and only follows if the user hasn't scrolled away.
                    } else if (eventType === "done") {
                        contentEl.querySelectorAll("pre code").forEach((block) => {
                            hljs.highlightElement(block);
                        });
                        updateScrollBtnVisibility(); // NEW — final check once syntax highlighting settles
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

    // ---------- NEW: keep scroll-to-bottom button above the (growing) input area ----------

    function updateInputAreaHeightVar() {
        chatEl.style.setProperty("--input-area-height", `${inputArea.offsetHeight}px`);
    }

    const inputAreaResizeObserver = new ResizeObserver(updateInputAreaHeightVar);
    inputAreaResizeObserver.observe(inputArea);

    updateInputAreaHeightVar(); // set correct value on initial load
    // ---------- end new block ----------
});


// Mobile sidebar drawer toggle — unchanged
(function () {
    var app = document.getElementById('app');
    var menuBtn = document.getElementById('menu-btn');
    var overlay = document.getElementById('sidebar-overlay');

    if (!app || !menuBtn || !overlay) return;

    function openSidebar() {
        app.classList.add('sidebar-open');
        menuBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
        app.classList.remove('sidebar-open');
        menuBtn.setAttribute('aria-expanded', 'false');
    }

    menuBtn.addEventListener('click', function () {
        if (app.classList.contains('sidebar-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    overlay.addEventListener('click', closeSidebar);

    document.querySelectorAll('.conversation, .sidebar-link').forEach(function (el) {
        el.addEventListener('click', function () {
            if (window.innerWidth <= 900) {
                closeSidebar();
            }
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSidebar();
    });

    var newChatBtn = document.getElementById('new-chat-btn');
    var chatTitle = document.getElementById('chat-title');
    if (newChatBtn && chatTitle) {
        newChatBtn.addEventListener('click', function () {
            chatTitle.style.display = 'none';
        });
    }
})();