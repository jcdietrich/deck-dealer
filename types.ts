
export interface CardImage {
  name: string;
  title: string; // Display title of the card
  data: string; // Base64 encoded image
  type: string;
  tags: string[];
  note?: string;
  rotation?: number; // 0 or 180 degrees
  isFlipped?: boolean; // Per-card flip state
}

export interface Deck {
  id: string;
  name: string;
  notes: string;
  createdAt: number;
  cards: CardImage[];
  backImage?: string; // Stores the base64 data of the back/cardback image
  analysis?: string;
  startFaceDown: boolean; // Toggle to start cards face down
  startShuffled: boolean; // Toggle to shuffle automatically on start
  startInBrowse: boolean; // Toggle to jump directly to browse view
  rotationChance: number; // 0-100 probability of 180deg rotation on shuffle
}

export interface DeckAnalysisResponse {
  theme: string;
  visualStyle: string;
  suggestedMechanics: string;
  summary: string;
}
