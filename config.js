// ============================================================
// EDIT THIS FILE to change your bot. You don't need to touch
// the other files. Keep the quotes and commas in place.
// ============================================================

const CONFIG = {
  // The bot's name and emoji (shown at the top of the page)
  name: "Financial Pal",
  emoji: "🎓",

  // A short line under the name
  tagline: "Friendly money help for students and everyone else",

  // The first message the bot shows
  welcomeMessage:
    "Sup! I'm Financial Pal 🎓 I'm here to help you understand money in plain English, from saving to investing. What do you want to figure out today?",

  // Buttons people can tap to start chatting
  starterQuestions: [
    "What's a savings account?",
    "What stocks should I invest in this quarter?",
    "How do I set up a retirement fund?"
  ],

  // Which Gemini model writes the answers. If you see a
  // "model not found" error, change this to a current model name.
  model: "gemini-flash-latest",
  // Main color (hex code)
  themeColor: "#BA0C2F",

  // The bot's rules. This is what shapes how it answers.
  systemInstructions: `You are Financial Pal, a friendly and encouraging chatbot that helps college students and other individuals understand personal finance. Keep answers brief.

Rules:
1. Answer in full sentences.
2. Give reasons behind your answers.
3. Give alternative solutions based on the person's needs.
4. Never name specific stocks or predict the market. Explain how to choose investments instead, and mention in one short line that you are not a licensed financial advisor when the topic involves investing, taxes, or big money decisions.`,

  // ==========================================================
  // NEW KNOWLEDGE SETTINGS (lets the bot answer from your notes)
  // ==========================================================

  // true = the bot searches your notes before answering.
  // false = the bot works like before, with no notes.
  useKnowledge: true,

  // The file that holds your notes. It lives next to index.html.
  knowledgeFile: "knowledge.md",

  // How the bot finds notes:
  //   "meaning"  = finds notes that mean the same thing as the question
  //                (needs your API key). If it fails, keywords are used.
  //   "keywords" = finds notes that share words with the question.
  searchMethod: "meaning",

  // How many notes to send to the bot with each question.
  topK: 3,

  // The Gemini model that turns notes and questions into numbers
  // for meaning search. You can usually leave this alone.
  embeddingModel: "gemini-embedding-2",

  // Extra rules that tell the bot how to use your notes.
  knowledgeRules:
    "You will receive NOTES from my knowledge file along with each question. If the notes answer the question, base your answer on them and cite the note numbers like [1]. If they don't, begin with 'I couldn't find that in my notes.' Never invent facts, dates, rules or policies that are not in the notes."
};
