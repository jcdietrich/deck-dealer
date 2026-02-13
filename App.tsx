
import React, { useState, useMemo, useRef, useEffect } from 'react';
import Layout from './components/Layout.tsx';
import { Deck, CardImage } from './types.ts';
import { extractImagesFromZip } from './services/zipService.ts';
import { analyzeDeck } from './services/geminiService.ts';
import { saveDecks, loadDecks, requestPersistentStorage } from './services/storageService.ts';

const App: React.FC = () => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [isBrowseMode, setIsBrowseMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isAppLoading, setIsAppLoading] = useState(true);
  
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStartFaceDown, setFormStartFaceDown] = useState(false);
  const [formStartShuffled, setFormStartShuffled] = useState(false);
  const [formStartInBrowse, setFormStartInBrowse] = useState(false);
  const [formRotationChance, setFormRotationChance] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const selectedDeck = decks.find(d => d.id === selectedDeckId);

  useEffect(() => {
    const init = async () => {
      try {
        await requestPersistentStorage();
        const storedDecks = await loadDecks();
        // Ensure legacy data or corrupted data has initialized fields
        const cleanedDecks = storedDecks.map(d => ({
          ...d,
          cards: d.cards.map(c => ({
            ...c,
            tags: c.tags || [],
            note: c.note || ''
          }))
        }));
        setDecks(cleanedDecks);
      } catch (e) {
        console.error("Failed to load collection", e);
      } finally {
        setIsAppLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!isAppLoading) {
      saveDecks(decks);
    }
  }, [decks, isAppLoading]);

  const handleSelectDeck = (deckId: string) => {
    const targetDeck = decks.find(d => d.id === deckId);
    setSelectedDeckId(deckId);
    setSearchQuery('');
    
    if (targetDeck?.startShuffled) {
      shuffleDeck(deckId);
    }

    if (targetDeck?.startInBrowse && targetDeck.cards.length > 0) {
      setActiveCardIndex(0);
      setIsBrowseMode(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeCardIndex === null || !selectedDeck) return;
      
      if (e.key === 'ArrowLeft' && activeCardIndex > 0) {
        setActiveCardIndex(prev => prev! - 1);
      } else if (e.key === 'ArrowRight' && activeCardIndex < selectedDeck.cards.length - 1) {
        setActiveCardIndex(prev => prev! + 1);
      } else if (e.key === ' ' || e.key === 'Enter') {
        toggleCardFlip(selectedDeck.id, activeCardIndex);
      } else if (e.key === 'Escape') {
        if (isBrowseMode) {
          setIsBrowseMode(false);
        } else {
          setActiveCardIndex(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCardIndex, selectedDeckId, decks, isBrowseMode]);

  const handleAddDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !file) return;

    setIsLoading(true);
    try {
      const extractedCards = await extractImagesFromZip(file);
      const backRegex = /(card-?)?backs?\.(jpg|jpeg|png|gif|webp)/i;
      let backImageData: string | undefined;
      
      const filteredCards = extractedCards.filter(card => {
        if (backRegex.test(card.name)) {
          if (!backImageData) backImageData = card.data;
          return false;
        }
        return true;
      }).map(card => ({ 
        ...card, 
        rotation: 0, 
        isFlipped: formStartFaceDown,
        tags: [],
        note: ''
      }));

      const newDeck: Deck = {
        id: crypto.randomUUID(),
        name: formName,
        notes: formNotes,
        createdAt: Date.now(),
        cards: filteredCards,
        backImage: backImageData,
        startFaceDown: formStartFaceDown,
        startShuffled: formStartShuffled,
        startInBrowse: formStartInBrowse,
        rotationChance: formRotationChance
      };
      setDecks(prev => [newDeck, ...prev]);
      setIsAdding(false);
      resetForm();
    } catch (err) {
      alert("Error processing zip file. Ensure it contains images.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDeck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeckId || !formName) return;

    setDecks(prev => prev.map(deck => 
      deck.id === selectedDeckId 
        ? { 
            ...deck, 
            name: formName, 
            notes: formNotes, 
            startFaceDown: formStartFaceDown, 
            startShuffled: formStartShuffled, 
            startInBrowse: formStartInBrowse,
            rotationChance: formRotationChance 
          }
        : deck
    ));
    setIsEditing(false);
    resetForm();
  };

  const openEditModal = () => {
    if (!selectedDeck) return;
    setFormName(selectedDeck.name);
    setFormNotes(selectedDeck.notes);
    setFormStartFaceDown(selectedDeck.startFaceDown);
    setFormStartShuffled(selectedDeck.startShuffled);
    setFormStartInBrowse(selectedDeck.startInBrowse || false);
    setFormRotationChance(selectedDeck.rotationChance);
    setIsEditing(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormNotes('');
    setFormStartFaceDown(false);
    setFormStartShuffled(false);
    setFormStartInBrowse(false);
    setFormRotationChance(0);
    setFile(null);
  };

  const handleAnalyze = async (deckId: string) => {
    const deck = decks.find(d => d.id === deckId);
    if (!deck || deck.cards.length === 0) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeDeck(deck.name, deck.notes, deck.cards);
      setDecks(prev => prev.map(d => d.id === deckId ? { ...d, analysis: result } : d));
    } catch (err) {
      alert("AI analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const shuffleDeck = (deckId: string) => {
    setDecks(prev => prev.map(deck => {
      if (deck.id !== deckId) return deck;
      const shuffledCards = [...deck.cards];
      const rotationChance = deck.rotationChance / 100;

      for (let i = shuffledCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
      }

      const randomizedCards = shuffledCards.map(card => ({
        ...card,
        isFlipped: deck.startFaceDown,
        rotation: Math.random() < rotationChance ? 180 : 0
      }));

      return { ...deck, cards: randomizedCards };
    }));
    if (activeCardIndex !== null) setActiveCardIndex(0);
  };

  const toggleCardFlip = (deckId: string, cardIndex: number) => {
    setDecks(prev => prev.map(deck => {
      if (deck.id !== deckId) return deck;
      const newCards = [...deck.cards];
      newCards[cardIndex] = { ...newCards[cardIndex], isFlipped: !newCards[cardIndex].isFlipped };
      return { ...deck, cards: newCards };
    }));
  };

  const deleteDeck = (id: string) => {
    if (confirm("Are you sure you want to delete this deck?")) {
      setDecks(prev => prev.filter(d => d.id !== id));
      if (selectedDeckId === id) setSelectedDeckId(null);
    }
  };

  const addTagToCard = (deckId: string, cardIndex: number, tag: string) => {
    if (!tag.trim()) return;
    setDecks(prev => prev.map(deck => {
      if (deck.id !== deckId) return deck;
      const newCards = [...deck.cards];
      const currentTags = newCards[cardIndex].tags || [];
      if (!currentTags.includes(tag.trim())) {
        newCards[cardIndex] = { ...newCards[cardIndex], tags: [...currentTags, tag.trim()] };
      }
      return { ...deck, cards: newCards };
    }));
    setTagInput('');
  };

  const updateCardTitle = (deckId: string, cardIndex: number, title: string) => {
    setDecks(prev => prev.map(deck => {
      if (deck.id !== deckId) return deck;
      const newCards = [...deck.cards];
      newCards[cardIndex] = { ...newCards[cardIndex], title };
      return { ...deck, cards: newCards };
    }));
  };

  const updateCardNote = (deckId: string, cardIndex: number, note: string) => {
    setDecks(prev => prev.map(deck => {
      if (deck.id !== deckId) return deck;
      const newCards = [...deck.cards];
      newCards[cardIndex] = { ...newCards[cardIndex], note: note };
      return { ...deck, cards: newCards };
    }));
  };

  const removeTagFromCard = (deckId: string, cardIndex: number, tagToRemove: string) => {
    setDecks(prev => prev.map(deck => {
      if (deck.id !== deckId) return deck;
      const newCards = [...deck.cards];
      const currentTags = newCards[cardIndex].tags || [];
      newCards[cardIndex] = { ...newCards[cardIndex], tags: currentTags.filter(t => t !== tagToRemove) };
      return { ...deck, cards: newCards };
    }));
  };

  const filteredCards = useMemo(() => {
    if (!selectedDeck) return [];
    if (!searchQuery.trim()) return selectedDeck.cards;
    const query = searchQuery.toLowerCase();
    return selectedDeck.cards.filter(card => 
      card.title.toLowerCase().includes(query) || 
      (card.tags || []).some(tag => tag.toLowerCase().includes(query)) ||
      (card.note || '').toLowerCase().includes(query)
    );
  }, [selectedDeck, searchQuery]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || !selectedDeck) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50 && activeCardIndex !== null && activeCardIndex < selectedDeck.cards.length - 1) setActiveCardIndex(prev => prev! + 1);
    if (distance < -50 && activeCardIndex !== null && activeCardIndex > 0) setActiveCardIndex(prev => prev! - 1);
    touchStartX.current = null; touchEndX.current = null;
  };

  if (isAppLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <LoadingIcon className="animate-spin h-12 w-12 text-indigo-500 mb-4" />
          <h2 className="text-xl font-bold text-white">Waking up DeckMaster...</h2>
          <p className="text-slate-500 text-sm mt-2">Restoring your collection from local storage</p>
        </div>
      </Layout>
    );
  }

  if (isBrowseMode && activeCardIndex !== null && selectedDeck) {
    const currentCard = selectedDeck.cards[activeCardIndex];
    const isFlipped = currentCard.isFlipped;
    const displayImage = isFlipped ? (selectedDeck.backImage || 'white') : currentCard.data;
    const rotation = isFlipped ? 0 : (currentCard.rotation || 0);

    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-0 md:p-8 animate-in fade-in duration-300" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className="absolute top-6 left-6 z-10 flex items-center gap-4">
          <button onClick={() => setIsBrowseMode(false)} className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all border border-white/10 group flex items-center gap-2">
            <ChevronLeft size={24} />
            <span className="text-sm font-bold pr-2 opacity-0 group-hover:opacity-100 transition-opacity">Back to Editor</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); shuffleDeck(selectedDeck.id); }} className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full transition-all border border-white/10 flex items-center gap-2 group" title="Shuffle Deck">
            <ShuffleIcon />
            <span className="text-sm font-bold pr-2 opacity-0 group-hover:opacity-100 transition-opacity">Shuffle</span>
          </button>
        </div>
        <div className="absolute top-6 right-6 z-10 px-4 py-2 bg-black/40 backdrop-blur-md text-white/50 text-xs font-bold rounded-full border border-white/5 uppercase tracking-[0.2em]">
          {activeCardIndex + 1} / {selectedDeck.cards.length}
        </div>
        <div className="w-full h-full flex items-center justify-center overflow-hidden cursor-pointer select-none perspective-1000" onClick={() => toggleCardFlip(selectedDeck.id, activeCardIndex)}>
          {displayImage === 'white' ? (
            <div 
              style={{ transform: `rotate(${rotation}deg)` }}
              className="w-[85%] sm:w-[50%] md:w-[40%] lg:w-[30%] aspect-[2.5/3.5] bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center border-[12px] border-slate-50 animate-in zoom-in duration-300 relative overflow-hidden ring-1 ring-slate-200"
            >
               <div className="absolute inset-0 border-[2px] border-slate-200 m-4 rounded-xl opacity-20 pointer-events-none" />
               <div className="w-32 h-32 border border-slate-200 rounded-full flex items-center justify-center opacity-10 bg-slate-50">
                  <CardsIcon />
               </div>
               <span className="text-slate-400 font-bold uppercase tracking-[0.4em] text-[10px] mt-8 opacity-40">Blank Back</span>
            </div>
          ) : (
            <img 
              key={`${activeCardIndex}-${isFlipped}`} 
              src={displayImage} 
              style={{ transform: `rotate(${rotation}deg)` }}
              className={`max-w-[95%] max-h-[90%] md:max-h-[95%] object-contain rounded-lg shadow-[0_0_100px_rgba(0,0,0,0.5)] transition-opacity duration-300 ${isFlipped ? 'animate-in zoom-in-95' : 'animate-in slide-in-from-bottom-2'}`} 
              alt="Card view" 
            />
          )}
        </div>
        <div className="absolute bottom-16 text-white/40 text-[10px] uppercase tracking-widest font-bold pointer-events-none text-center px-4">
          Tap card to flip • Swipe to navigate • Arrows for desktop
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-8 opacity-20 hover:opacity-100 transition-opacity">
           <button disabled={activeCardIndex === 0} onClick={(e) => { e.stopPropagation(); setActiveCardIndex(prev => prev! - 1); }} className="text-white hover:text-indigo-400 disabled:opacity-0 transition-colors"><ChevronLeft size={48} /></button>
           <div className="w-1 h-1 rounded-full bg-white/40" />
           <button disabled={activeCardIndex === selectedDeck.cards.length - 1} onClick={(e) => { e.stopPropagation(); setActiveCardIndex(prev => prev! + 1); }} className="text-white hover:text-indigo-400 disabled:opacity-0 transition-colors"><ChevronRight size={48} /></button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white">Your Decks</h2>
          <p className="text-slate-400">Manage and analyze your card collections</p>
        </div>
        <button onClick={() => { resetForm(); setIsAdding(true); }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2">
          <PlusIcon /> New Deck
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className={`space-y-4 ${selectedDeckId ? 'lg:col-span-4' : 'lg:col-span-12'}`}>
          {decks.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4"><CardsIcon /></div>
              <h3 className="text-lg font-medium text-slate-300">No decks found</h3>
              <p className="text-slate-500 mb-6">Create your first card deck to get started</p>
              <button onClick={() => setIsAdding(true)} className="text-indigo-400 hover:text-indigo-300 font-medium">Add deck now &rarr;</button>
            </div>
          ) : (
            <div className={selectedDeckId ? 'flex flex-col gap-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'}>
              {decks.map(deck => (
                <div key={deck.id} onClick={() => handleSelectDeck(deck.id)} className={`group relative overflow-hidden rounded-xl border transition-all cursor-pointer ${selectedDeckId === deck.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-white truncate pr-6">{deck.name}</h3>
                      <button onClick={(e) => { e.stopPropagation(); deleteDeck(deck.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"><TrashIcon /></button>
                    </div>
                    <p className="text-sm text-slate-400 line-clamp-2 mb-4 h-10">{deck.notes || 'No notes provided'}</p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1"><StackIcon /> {deck.cards.length} cards</span>
                      <span>{new Date(deck.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedDeckId && selectedDeck && (
          <div className="lg:col-span-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/40">
                <div className="flex-1 overflow-hidden">
                  <h2 className="text-2xl font-bold text-white truncate">{selectedDeck.name}</h2>
                  <p className="text-slate-400 text-sm mt-1 truncate">{selectedDeck.notes}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${selectedDeck.startFaceDown ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                       {selectedDeck.startFaceDown ? 'Face Down' : 'Face Up'}
                     </span>
                     {selectedDeck.startShuffled && (
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                         Auto-Shuffle
                       </span>
                     )}
                     {selectedDeck.startInBrowse && (
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter bg-blue-500/10 text-blue-400 border border-blue-500/20">
                         Quick Browse
                       </span>
                     )}
                     {selectedDeck.rotationChance > 0 && (
                       <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter bg-amber-500/10 text-amber-400 border border-amber-500/20">
                         {selectedDeck.rotationChance}% Rotation
                       </span>
                     )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button onClick={() => { setActiveCardIndex(0); setIsBrowseMode(true); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2" title="Distraction-free Browse Mode"><MaximizeIcon /> Browse</button>
                  <button onClick={openEditModal} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors border border-slate-700" title="Edit Metadata"><EditIcon size={18} /></button>
                  <button onClick={() => shuffleDeck(selectedDeck.id)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors border border-slate-700" title="Shuffle Deck"><ShuffleIcon /></button>
                  <button disabled={isAnalyzing} onClick={() => handleAnalyze(selectedDeck.id)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 border border-slate-700">{isAnalyzing ? <LoadingIcon className="animate-spin h-4 w-4" /> : <SparklesIcon />} {selectedDeck.analysis ? 'Re-Analyze' : 'Analyze AI'}</button>
                  <button onClick={() => setSelectedDeckId(null)} className="p-2 text-slate-500 hover:text-white"><CloseIcon /></button>
                </div>
              </div>

              <div className="p-6">
                {selectedDeck.analysis && (
                  <div className="mb-8 p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-4 text-indigo-400"><SparklesIcon /><h3 className="font-bold uppercase tracking-wider text-xs">AI Insights</h3></div>
                    <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedDeck.analysis}</div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <h3 className="text-lg font-bold text-white">Cards ({filteredCards.length})</h3>
                  <div className="relative w-full sm:w-64">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                    <input type="text" placeholder="Search title, tag, or note..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-600 outline-none transition-all placeholder:text-slate-700" />
                  </div>
                </div>
                {filteredCards.length === 0 ? <div className="text-center py-10 text-slate-500 border border-dashed border-slate-800 rounded-lg">No cards match your search criteria.</div> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredCards.map((card) => {
                      const originalIndex = selectedDeck.cards.findIndex(c => c === card);
                      const isFlipped = card.isFlipped;
                      const displayImg = isFlipped ? (selectedDeck.backImage || 'white') : card.data;
                      const rotation = isFlipped ? 0 : (card.rotation || 0);

                      return (
                        <div key={originalIndex} className="aspect-[2.5/3.5] bg-slate-800 rounded-lg overflow-hidden border border-slate-700 group hover:border-indigo-500 transition-colors relative cursor-pointer shadow-sm hover:shadow-indigo-500/10" onClick={() => setActiveCardIndex(originalIndex)}>
                          {displayImg === 'white' ? (
                            <div className="w-full h-full bg-white flex items-center justify-center border-4 border-slate-100">
                               <CardsIcon />
                            </div>
                          ) : (
                            <img 
                              src={displayImg} 
                              alt={card.title} 
                              style={{ transform: `rotate(${rotation}deg)` }}
                              className="w-full h-full object-cover" 
                            />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center"><EyeIcon className="text-white opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 drop-shadow-lg" /></div>
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                            <p className="text-[10px] text-white truncate font-medium mb-1">{isFlipped ? '???' : card.title}</p>
                            {!isFlipped && (
                              <div className="flex flex-wrap gap-1">
                                {(card.tags || []).slice(0, 2).map((tag, i) => <span key={i} className="text-[8px] bg-indigo-600/80 text-white px-1 rounded uppercase tracking-tighter">{tag}</span>)}
                                {(card.tags || []).length > 2 && <span className="text-[8px] text-slate-400">+{(card.tags || []).length - 2}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {activeCardIndex !== null && selectedDeck && !isBrowseMode && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-200">
            <div className="md:w-3/5 bg-black flex flex-col items-center justify-center p-6 relative group select-none">
              <div className="absolute top-4 left-6 flex items-center gap-3">
                <div className="px-3 py-1 bg-white/10 backdrop-blur text-white/60 text-[10px] rounded-full uppercase tracking-widest font-bold border border-white/5">Card {activeCardIndex + 1} / {selectedDeck.cards.length}</div>
                <button onClick={() => setIsBrowseMode(true)} className="px-3 py-1 bg-indigo-600/20 backdrop-blur text-indigo-400 text-[10px] rounded-full uppercase tracking-widest font-bold border border-indigo-500/20 hover:bg-indigo-600/40 transition-colors flex items-center gap-1.5"><MaximizeIcon size={12} /> Browse Fullscreen</button>
              </div>
              <div className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => toggleCardFlip(selectedDeck.id, activeCardIndex)}>
                {selectedDeck.cards[activeCardIndex].isFlipped && !selectedDeck.backImage ? (
                  <div className="w-[85%] aspect-[2.5/3.5] bg-white rounded-lg shadow-2xl flex items-center justify-center border-4 border-slate-300"><span className="text-slate-300 font-bold uppercase tracking-widest text-sm opacity-50">Blank Back</span></div>
                ) : (
                  <img 
                    src={selectedDeck.cards[activeCardIndex].isFlipped && selectedDeck.backImage ? selectedDeck.backImage : selectedDeck.cards[activeCardIndex].data} 
                    style={{ transform: `rotate(${selectedDeck.cards[activeCardIndex].isFlipped ? 0 : (selectedDeck.cards[activeCardIndex].rotation || 0)}deg)` }}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-300 hover:scale-[1.01]" 
                    alt="Selected card" 
                  />
                )}
              </div>
              <div className="absolute inset-y-0 left-0 w-1/4 flex items-center justify-start pl-4 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={activeCardIndex === 0} onClick={(e) => { e.stopPropagation(); setActiveCardIndex(prev => prev! - 1); }} className="bg-black/60 p-4 rounded-full text-white hover:bg-indigo-600 transition-colors disabled:opacity-0"><ChevronLeft size={32} /></button></div>
              <div className="absolute inset-y-0 right-0 w-1/4 flex items-center justify-end pr-4 opacity-0 group-hover:opacity-100 transition-opacity"><button disabled={activeCardIndex === selectedDeck.cards.length - 1} onClick={(e) => { e.stopPropagation(); setActiveCardIndex(prev => prev! + 1); }} className="bg-black/60 p-4 rounded-full text-white hover:bg-indigo-600 transition-colors disabled:opacity-0"><ChevronRight size={32} /></button></div>
            </div>
            <div className="md:w-2/5 p-8 flex flex-col h-full border-t md:border-t-0 md:border-l border-slate-800 overflow-hidden bg-slate-900/80">
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1 overflow-hidden">
                  <input 
                    type="text" 
                    value={selectedDeck.cards[activeCardIndex].title} 
                    onChange={(e) => updateCardTitle(selectedDeck.id, activeCardIndex, e.target.value)}
                    className="text-2xl font-bold text-white mb-1 w-full bg-transparent border-b border-transparent focus:border-indigo-500 outline-none transition-colors"
                  />
                  <p className="text-slate-500 text-xs mt-1">File: {selectedDeck.cards[activeCardIndex].name}</p>
                </div>
                <button onClick={() => { setActiveCardIndex(null); setTagInput(''); }} className="p-2 text-slate-500 hover:text-white bg-slate-800 rounded-full transition-colors flex-shrink-0 ml-2"><CloseIcon /></button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 space-y-8">
                <div><label className="block text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider text-[10px]">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(!selectedDeck.cards[activeCardIndex].tags || selectedDeck.cards[activeCardIndex].tags.length === 0) ? <p className="text-slate-600 text-sm italic">No tags added yet</p> : selectedDeck.cards[activeCardIndex].tags.map((tag, idx) => (<span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-full text-xs font-semibold group">{tag}<button onClick={() => removeTagFromCard(selectedDeck.id, activeCardIndex, tag)} className="hover:text-red-400 transition-colors"><CloseIcon size={12} /></button></span>))}
                  </div>
                  <div className="flex gap-2"><input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTagToCard(selectedDeck.id, activeCardIndex, tagInput); }} placeholder="Add tag..." className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white text-sm focus:ring-1 focus:ring-indigo-600 outline-none transition-all placeholder:text-slate-700" /><button onClick={() => addTagToCard(selectedDeck.id, activeCardIndex, tagInput)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors">Add</button></div>
                </div>
                <div><label className="block text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider text-[10px]">Individual Card Notes</label><textarea value={selectedDeck.cards[activeCardIndex].note || ''} onChange={(e) => updateCardNote(selectedDeck.id, activeCardIndex, e.target.value)} placeholder="Lore, mechanical notes, or flavor text..." rows={6} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-white text-sm focus:ring-1 focus:ring-indigo-600 outline-none transition-all placeholder:text-slate-700 resize-none leading-relaxed" /><p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1"><CheckIcon className="w-3 h-3" /> Auto-saved</p></div>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-800 flex justify-between gap-4">
                <button disabled={activeCardIndex === 0} onClick={() => { setActiveCardIndex(prev => prev! - 1); setTagInput(''); }} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-20 flex items-center justify-center gap-2"><ChevronLeft size={16} /> Previous</button>
                <button disabled={activeCardIndex === selectedDeck.cards.length - 1} onClick={() => { setActiveCardIndex(prev => prev! + 1); setTagInput(''); }} className="flex-1 py-3 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-xl text-sm font-bold transition-colors disabled:opacity-20 flex items-center justify-center gap-2 border border-indigo-500/20">Next <ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(isAdding || isEditing) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{isEditing ? 'Edit Deck Info' : 'Create New Deck'}</h3>
              <button onClick={() => { setIsAdding(false); setIsEditing(false); }} className="text-slate-500 hover:text-white"><CloseIcon /></button>
            </div>
            <form onSubmit={isEditing ? handleUpdateDeck : handleAddDeck} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5 text-[10px] uppercase tracking-wider font-bold">Deck Name</label>
                <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Space Explorers V1" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none transition-all placeholder:text-slate-700 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5 text-[10px] uppercase tracking-wider font-bold">Project Notes</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="High-level project description..." rows={3} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none transition-all placeholder:text-slate-700 resize-none text-sm" />
              </div>
              
              <div className="space-y-4 py-4 border-y border-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-white">Start Face Down</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-tight">Show back side initially</span>
                  </div>
                  <button type="button" onClick={() => setFormStartFaceDown(!formStartFaceDown)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none ${formStartFaceDown ? 'bg-indigo-600' : 'bg-slate-700'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formStartFaceDown ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-white">Start Shuffled</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-tight">Shuffle automatically on load</span>
                  </div>
                  <button type="button" onClick={() => setFormStartShuffled(!formStartShuffled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none ${formStartShuffled ? 'bg-indigo-600' : 'bg-slate-700'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formStartShuffled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-white">Start in Browse</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-tight">Jump directly to fullscreen viewer</span>
                  </div>
                  <button type="button" onClick={() => setFormStartInBrowse(!formStartInBrowse)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none ${formStartInBrowse ? 'bg-indigo-600' : 'bg-slate-700'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formStartInBrowse ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="block text-sm font-medium text-white">Rotation Chance</span>
                    <span className="text-xs font-bold text-indigo-400">{formRotationChance}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" step="1"
                    value={formRotationChance}
                    onChange={(e) => setFormRotationChance(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500 uppercase tracking-tight">Chance of 180° orientation flip on shuffle</span>
                </div>
              </div>

              {!isEditing && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5 text-[10px] uppercase tracking-wider font-bold">Deck Images (ZIP File)</label>
                  <div className="relative group">
                    <input type="file" required accept=".zip" onChange={(e) => setFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className={`w-full border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all ${file ? 'bg-indigo-600/10 border-indigo-600' : 'border-slate-800 group-hover:border-slate-600 bg-slate-950'}`}>
                      <UploadIcon className={file ? 'text-indigo-400' : 'text-slate-600'} />
                      <p className={`mt-2 text-sm ${file ? 'text-indigo-300' : 'text-slate-500'}`}>{file ? file.name : 'Select or drop .zip file'}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="pt-2">
                <button type="submit" disabled={isLoading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                  {isLoading ? (<><LoadingIcon className="animate-spin h-5 w-5" /> Processing...</>) : (isEditing ? 'Update Deck' : 'Create Deck')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

// --- Icons ---
const MaximizeIcon = ({ size = 18 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>);
const PlusIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>);
const TrashIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>);
const StackIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>);
const CloseIcon = ({ size = 20 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const UploadIcon = ({ className = "" }) => (<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>);
const CardsIcon = () => (<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="10" x2="21" y2="10"></line></svg>);
const SparklesIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"></path></svg>);
const LoadingIcon = ({ className = "" }) => (<svg className={className} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>);
const SearchIcon = ({ className = "" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>);
const ShuffleIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>);
const EyeIcon = ({ className = "" }) => (<svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
const ChevronLeft = ({ size = 24 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>);
const ChevronRight = ({ size = 24 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const CheckIcon = ({ className = "" }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>);
const EditIcon = ({ size = 20 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>);

export default App;
