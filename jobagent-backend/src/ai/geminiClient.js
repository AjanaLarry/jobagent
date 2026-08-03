const { GoogleGenerativeAI } = require('@google/generative-ai');

let _client = null;

function getGeminiClient() {
  if (!_client) {
    _client = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY
    );
  }
  return _client;
}

module.exports = { getGeminiClient };
