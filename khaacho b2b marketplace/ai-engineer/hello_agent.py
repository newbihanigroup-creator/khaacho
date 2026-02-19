import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Load API key from environment variable
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a friendly AI assistant."},
        {"role": "user", "content": "Say hello and explain what an AI agent is in one sentence."}
    ]
)

print(response.choices[0].message.content)
