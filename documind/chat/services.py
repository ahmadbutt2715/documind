import sqlite3
from dotenv import load_dotenv
from langchain_core.tools import tool           # for custom tools
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph.message import add_messages
from langgraph.graph import START, END, StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_experimental.tools import PythonREPLTool     # calculator tool
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_community.tools import DuckDuckGoSearchRun   # web search tool
from ddgs.exceptions import DDGSException                   # web search tool Duck Duck Go exceptions
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()



# state schemas
class MessageState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# generative model
llm = ChatGoogleGenerativeAI(model="gemini-flash-lite-latest")


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



tools_list = [web_search, calculator]


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

# ------------------------------------------------------------------------------------------------------


# checkpointer
conn = sqlite3.connect(database='db.sqlite3', check_same_thread=False)     # support multiple threats
checkpointer = SqliteSaver(conn=conn)        # where to store state of graph


# --------------------------------------------- Build Graph ---------------------------------------------
graph = StateGraph(MessageState)

graph.add_node("chat_node", chat_node)
graph.add_node('tools', tool_node)

graph.add_edge(START, "chat_node")
graph.add_conditional_edges('chat_node', tools_condition)
graph.add_edge('tools', 'chat_node')

chatbot = graph.compile(checkpointer=checkpointer)








# query with chatbot
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






import markdown
import bleach

ALLOWED_TAGS = ["p", "strong", "em", "code", "pre", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote", "br"]

def render_markdown_safe(text: str) -> str:
    html = markdown.markdown(text, extensions=["fenced_code", "tables"])
    return bleach.clean(html, tags=ALLOWED_TAGS, attributes={"a": ["href"]})