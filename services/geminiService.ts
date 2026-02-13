
import { GoogleGenAI, Type } from "@google/genai";
import { CardImage } from "../types";

export const analyzeDeck = async (name: string, notes: string, cards: CardImage[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use up to 5 cards for visual context to avoid token limits
  const sampleCards = cards.slice(0, 5);
  
  const imageParts = sampleCards.map(card => {
    const base64Data = card.data.split(',')[1];
    return {
      inlineData: {
        data: base64Data,
        mimeType: card.type
      }
    };
  });

  const prompt = `
    You are a professional game designer and art critic. 
    Analyze this card deck named "${name}".
    Notes from the creator: "${notes}"
    
    I have provided images of some cards from the deck. 
    Please provide a detailed analysis in Markdown format covering:
    1. Visual Theme and Aesthetic
    2. Suggested Card Game Mechanics that would fit this art style
    3. General impressions and potential audience.
    4. Constructive feedback on cohesion.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { 
        parts: [
          ...imageParts,
          { text: prompt }
        ] 
      }
    });

    return response.text || "Analysis failed to generate.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Error analyzing deck. Please check your network or API key.";
  }
};
