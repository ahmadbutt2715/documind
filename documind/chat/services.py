from dotenv import load_dotenv
from langchain_core.tools import tool           # for custom tools
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph.message import add_messages
from langgraph.graph import START, END, StateGraph
from psycopg.rows import dict_row
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool
from langchain_experimental.tools import PythonREPLTool     # calculator tool
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_community.tools import DuckDuckGoSearchRun   # web search tool
from ddgs.exceptions import DDGSException                   # web search tool Duck Duck Go exceptions
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
import markdown
import bleach
import os
from django.conf import settings
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.runnables import RunnableConfig
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS

load_dotenv()


# --------------------------------------------- RAG components / helper functions ---------------------------------------------

VECTORSTORE_DIR = os.path.join(settings.BASE_DIR, "vectorstores")

embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-2")


def get_vectorstore_path(thread_id: str) -> str:
    return os.path.join(VECTORSTORE_DIR, thread_id)


def ingest_pdf(file_path: str, thread_id: str):
    """Load, split, embed a PDF and save/append to this thread's vector store."""
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(docs)

    path = get_vectorstore_path(thread_id)
    os.makedirs(VECTORSTORE_DIR, exist_ok=True)

    if os.path.exists(path):
        vector_store = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
        vector_store.add_documents(chunks)  # append — supports multiple uploads per conversation
    else:
        vector_store = FAISS.from_documents(chunks, embeddings)

    vector_store.save_local(path)



# --------------------------------------------- Tools ---------------------------------------------
# tool 1
ddg_obj = DuckDuckGoSearchRun(region='us-en')
@tool       # wrapping it in custom function to handle exceptions
def web_search(query: str) -> str:
    """Search the web for current information (news, prices, facts) using DuckDuckGo."""
    try:
        return ddg_obj.invoke(query)
    except DDGSException as e:
        return f"Web search is currently unavailable ({e}). Answer using existing knowledge and let the user know live search failed."
    except Exception as e:
        return f"Web search failed unexpectedly ({e}). Answer using existing knowledge and let the user know live search failed."


# tool 2
calculator = PythonREPLTool()   # it can execute python code, change it before going into production


# tool 3
@tool
def rag_tool(query: str, config: RunnableConfig) -> dict:
    """Retrieve relevant information from documents uploaded in this conversation.
Use this tool when the user asks factual/conceptual questions that might be
answered from an uploaded document."""

    thread_id = config["configurable"]["thread_id"]
    path = get_vectorstore_path(thread_id)

    if not os.path.exists(path):
        return {"query": query, "context": [], "metadata": [], "note": "No document has been uploaded in this conversation yet."}

    vector_store = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
    retriever = vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 4})

    result = retriever.invoke(query)
    return {
        "query": query,
        "context": [doc.page_content for doc in result],
        "metadata": [doc.metadata for doc in result],
    }



tools_list = [web_search, calculator, rag_tool]



# --------------------------------------------- Graph state and Models ---------------------------------------------
# state schemas
class MessageState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# generative model
llm = ChatGoogleGenerativeAI(model="gemini-flash-lite-latest")


# llm with tools
llm_with_tools = llm.bind_tools(tools_list)



# --------------------------------------------- Graph Nodes ---------------------------------------------
tool_node = ToolNode(tools_list)

def chat_node(state: MessageState):

    # take user query from state
    messages = state['messages']

    # send query to llm
    response = llm_with_tools.invoke(messages)

    # store response to state
    return {"messages": [response]}



# --------------------------------------------- DB connection and Checkpointer ---------------------------------------------
DB_URI = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"

pool = ConnectionPool(conninfo=DB_URI, max_size=20, kwargs={"autocommit": True, "row_factory": dict_row})
checkpointer = PostgresSaver(pool)
checkpointer.setup()   # run once — creates the checkpoint tables if they don't exist



# --------------------------------------------- Build Graph ---------------------------------------------
graph = StateGraph(MessageState)

graph.add_node("chat_node", chat_node)
graph.add_node('tools', tool_node)

graph.add_edge(START, "chat_node")
graph.add_conditional_edges('chat_node', tools_condition)
graph.add_edge('tools', 'chat_node')

chatbot = graph.compile(checkpointer=checkpointer)







# --------------------------------------------- Helper functions ---------------------------------------------
# function 1: query with chatbot
def get_ai_reply_stream(thread_id: str, user_message: str):
    config = {"configurable": {"thread_id": thread_id}}

    for message_chunk, metadata in chatbot.stream(
        {"messages": [HumanMessage(content=user_message)]},
        config=config,
        stream_mode="messages",
    ):
        # Only stream tokens from your chat_node's LLM output —
        # skip chunks from tool_node (tool calls don't produce readable tokens)
        if metadata.get("langgraph_node") == "chat_node" and message_chunk.content:
            yield message_chunk.text



# function 2: render safe markdown
ALLOWED_TAGS = ["p", "strong", "em", "code", "pre", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote", "br"]
def render_markdown_safe(text: str) -> str:
    html = markdown.markdown(text, extensions=["fenced_code", "tables"])
    return bleach.clean(html, tags=ALLOWED_TAGS, attributes={"a": ["href"]})