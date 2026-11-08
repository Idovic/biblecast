/* Composant BibleSearch — navigation livre → chapitre → verset
   Nouvelles fonctionnalités: filtre A-Z, double version Bible, persistance état,
   favoris, filtre par livre dans recherche, sélection tout le chapitre */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, BookOpen, ChevronRight, ChevronLeft, BookMarked, Layers2, Plus, X, Star, Mic, MicOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BibleData, VerseReference } from '@/types/bible';
import { getChapters, getVerses, getVerseText, getParallelVerse, searchBible, parseReference, formatReference, BIBLE_BOOKS } from '@/lib/bible';
import { BIBLE_VERSIONS, loadVersion, searchVersions, lsgOf } from '@/lib/versions';
import { parseFrenchBibleRef } from '@/lib/speechParser';

type View = 'books' | 'chapters' | 'verses' | 'search' | 'favorites';

export interface BibleNavState {
  view: View;
  selectedBook: string | null;
  selectedChapter: number | null;
  searchQuery: string;
  alphaFilter: string | null;
}

interface BibleSearchProps {
  bible: BibleData | null;
  bible2?: BibleData | null;
  bible2Name?: string;
  navState?: BibleNavState;
  onNavStateChange?: (s: BibleNavState) => void;
  onSelectVerse: (verse: VerseReference) => void;
  onSelectVerse2?: (verse: VerseReference | null) => void;
  /** verse2 : version comparée imposée (recherche dans toutes les versions) */
  onProjectVerse?: (verse: VerseReference, verse2?: VerseReference | null) => void;
  onAddMultipleVerses?: (verses: VerseReference[]) => void;
  /** Projeter un passage entier (découpé en écrans) */
  onProjectPassage?: (verses: VerseReference[]) => void;
  currentProjectedVerse?: VerseReference | null;
  /** Recherche vocale (tablette Android) */
  onVoice?: () => Promise<string[]>;
}

const INITIAL_NAV: BibleNavState = { view: 'books', selectedBook: null, selectedChapter: null, searchQuery: '', alphaFilter: null };
const FAVORITES_KEY = 'biblecast:favorites';

const ALPHA_LETTERS = ['A', 'B', 'C', 'D', 'E', 'É', 'G', 'H', 'J', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'Z'];

function loadFavorites(): VerseReference[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); }
  catch { return []; }
}

function saveFavorites(favs: VerseReference[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); } catch { /* mémoire pleine */ }
}

export default function BibleSearch({
  bible, bible2, bible2Name = 'Darby',
  navState: externalNav, onNavStateChange,
  onSelectVerse, onSelectVerse2,
  onProjectVerse, onAddMultipleVerses, onProjectPassage,
  currentProjectedVerse,
  onVoice,
}: BibleSearchProps) {
  const [internalNav, setInternalNav] = useState<BibleNavState>(INITIAL_NAV);
  const nav = externalNav ?? internalNav;

  const setNav = useCallback((update: Partial<BibleNavState> | ((prev: BibleNavState) => BibleNavState)) => {
    const next = typeof update === 'function' ? update(nav) : { ...nav, ...update };
    if (onNavStateChange) onNavStateChange(next);
    else setInternalNav(next);
  }, [nav, onNavStateChange]);

  const [dualMode, setDualMode] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<VerseReference[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [favorites, setFavorites] = useState<VerseReference[]>(loadFavorites);
  const [searchBookFilter, setSearchBookFilter] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const hasBible2 = useMemo(() => bible2 ? Object.keys(bible2).length > 0 : false, [bible2]);

  const toggleFavorite = useCallback((verse: VerseReference) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.book === verse.book && f.chapter === verse.chapter && f.verse === verse.verse);
      const next = exists
        ? prev.filter(f => !(f.book === verse.book && f.chapter === verse.chapter && f.verse === verse.verse))
        : [...prev, verse];
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((verse: VerseReference) => {
    return favorites.some(f => f.book === verse.book && f.chapter === verse.chapter && f.verse === verse.verse);
  }, [favorites]);

  const availableBooks = useMemo(() => {
    if (!bible) return [];
    return BIBLE_BOOKS.filter(b => bible[b]);
  }, [bible]);

  const filteredBooks = useMemo(() => {
    const base = nav.alphaFilter
      ? availableBooks.filter(b => {
          const first = b.replace(/^\d+\s*/, '')[0]?.toUpperCase();
          return first === nav.alphaFilter ||
            (nav.alphaFilter === 'É' && first === 'É');
        })
      : availableBooks;
    return base;
  }, [availableBooks, nav.alphaFilter]);

  // Recherche aussi dans Darby
  const [allVersions, setAllVersions] = useState(false);
  const [otherVersions, setOtherVersions] = useState<{ id: string; data: BibleData }[]>([]);
  useEffect(() => {
    if (!allVersions || otherVersions.length) return;
    Promise.all(BIBLE_VERSIONS.map(async v => ({ id: v.id, data: await loadVersion(v.id) })))
      .then(list => setOtherVersions(list.filter((x): x is { id: string; data: BibleData } => !!x.data && Object.keys(x.data).length > 0)));
  }, [allVersions, otherVersions.length]);
  const isRefQuery = !!parseReference(nav.searchQuery);
  const searchResults = useMemo(() => {
    if (nav.view !== 'search' || !bible || nav.searchQuery.length < 2) return [];
    const main = searchBible(bible, nav.searchQuery, 80) as (ReturnType<typeof searchBible>[number] & { version?: string })[];
    if (!allVersions || isRefQuery) return main;
    return [...main, ...searchVersions(otherVersions, nav.searchQuery, 40)];
  }, [bible, nav.searchQuery, nav.view, allVersions, otherVersions, isRefQuery]);

  const booksInResults = useMemo(() => {
    const books = [...new Set(searchResults.map(r => r.book))];
    return books;
  }, [searchResults]);

  const filteredSearchResults = useMemo(() => {
    if (!searchBookFilter) return searchResults;
    return searchResults.filter(r => r.book === searchBookFilter);
  }, [searchResults, searchBookFilter]);

  const chapters = useMemo(() => {
    if (!bible || !nav.selectedBook) return [];
    return getChapters(bible, nav.selectedBook);
  }, [bible, nav.selectedBook]);

  const verses = useMemo(() => {
    if (!bible || !nav.selectedBook || !nav.selectedChapter) return [];
    return getVerses(bible, nav.selectedBook, nav.selectedChapter);
  }, [bible, nav.selectedBook, nav.selectedChapter]);

  const lastSelectedRef = useRef<VerseReference | null>(null);
  const [addedFlash, setAddedFlash] = useState(0);
  const handleSelectVerse = useCallback((verse: VerseReference) => {
    lastSelectedRef.current = verse;
    onSelectVerse(verse);
    if (dualMode && hasBible2 && bible2) {
      onSelectVerse2?.(getParallelVerse(bible2, verse));
    } else {
      onSelectVerse2?.(null);
    }
  }, [onSelectVerse, onSelectVerse2, dualMode, hasBible2, bible2]);

  const handleDoubleClickVerse = useCallback((verse: VerseReference) => {
    handleSelectVerse(verse);
    onProjectVerse?.(verse);
  }, [handleSelectVerse, onProjectVerse]);

  /** Résultat d'une autre version : comparaison LSG + cette version */
  const otherOf = (version: string) => otherVersions.find(x => x.id === version)?.data;
  const compareRef = (r: VerseReference & { version?: string }): { lsg: VerseReference; other: VerseReference } | null => {
    const data = r.version ? otherOf(r.version) : undefined;
    if (!data || !bible) return null;
    const k = lsgOf(data, r);
    const lsg = getVerseText(bible, k.book, k.chapter, k.verse);
    return lsg ? { lsg: { book: k.book, chapter: k.chapter, verse: k.verse, text: lsg }, other: { ...r, version: r.version } } : null;
  };

  const toggleMultiSelect = (verse: VerseReference) => {
    setSelectedVerses(prev =>
      prev.find(v => v.book === verse.book && v.chapter === verse.chapter && v.verse === verse.verse)
        ? prev.filter(v => !(v.book === verse.book && v.chapter === verse.chapter && v.verse === verse.verse))
        : [...prev, verse]
    );
  };

  const handleSelectAllChapter = () => {
    if (!bible || !nav.selectedBook || !nav.selectedChapter) return;
    const allVerses = verses.map(v => ({
      book: nav.selectedBook!,
      chapter: nav.selectedChapter!,
      verse: v,
      text: getVerseText(bible!, nav.selectedBook!, nav.selectedChapter!, v),
    }));
    setSelectedVerses(allVerses);
  };

  if (!bible) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Chargement de la Bible…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Barre de navigation + recherche */}
      <div className="shrink-0 px-2 pt-2 pb-1 space-y-2">
        <div className="flex items-center gap-2">
          {/* Bouton retour */}
          {nav.view !== 'books' && nav.view !== 'search' && nav.view !== 'favorites' && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (nav.view === 'verses') setNav({ view: 'chapters' });
                else if (nav.view === 'chapters') setNav({ view: 'books', selectedBook: null });
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Fil d'Ariane */}
          <div className="flex-1 flex items-center gap-1 text-xs text-muted-foreground overflow-hidden">
            <button onClick={() => setNav({ view: 'books', selectedBook: null, selectedChapter: null })}
              className="hover:text-foreground transition-smooth shrink-0">
              <BookMarked className="h-3.5 w-3.5 inline mr-0.5" />Bibles
            </button>
            {nav.view === 'favorites' && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0" />
                <span className="text-amber-400 font-medium">★ Favoris</span>
              </>
            )}
            {nav.selectedBook && nav.view !== 'favorites' && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0" />
                <button
                  onClick={() => nav.view === 'verses' && setNav({ view: 'chapters', selectedChapter: null })}
                  className={cn('hover:text-foreground truncate transition-smooth', nav.view === 'chapters' && 'text-foreground font-medium')}
                >
                  {nav.selectedBook}
                </button>
              </>
            )}
            {nav.selectedChapter && nav.view === 'verses' && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0" />
                <span className="text-foreground font-medium">Ch.{nav.selectedChapter}</span>
              </>
            )}
          </div>

          {/* Bouton Favoris */}
          <button
            onClick={() => setNav(prev => ({
              ...prev,
              view: prev.view === 'favorites' ? 'books' : 'favorites',
            }))}
            title="Versets favoris"
            className={cn(
              'h-7 w-7 rounded-lg border flex items-center justify-center transition-smooth shrink-0',
              nav.view === 'favorites'
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                : 'border-border/40 bg-secondary/40 text-muted-foreground hover:text-amber-400'
            )}
          >
            <Star className="h-3.5 w-3.5" fill={nav.view === 'favorites' ? 'currentColor' : 'none'} />
          </button>

          {/* Bouton double-version */}
          {hasBible2 && (
            <button
              onClick={() => {
                setDualMode(!dualMode);
                if (dualMode) onSelectVerse2?.(null);
                // L'aperçu montre tout de suite les deux versions du verset choisi
                else if (lastSelectedRef.current && bible2) onSelectVerse2?.(getParallelVerse(bible2, lastSelectedRef.current));
              }}
              title={`Mode double version ${dualMode ? 'actif' : 'inactif'}`}
              className={cn(
                'h-7 px-2 rounded-lg border text-[10px] font-medium flex items-center gap-1 shrink-0 transition-all',
                dualMode
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/40 bg-secondary/40 text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers2 className="h-3 w-3" />
              {dualMode ? `FR + ${bible2Name}` : `+${bible2Name}`}
            </button>
          )}

          {/* Recherche vocale : « Jean 3 verset 16 » */}
          {onVoice && (
            <button
              onClick={async () => {
                setListening(true);
                const results = await onVoice();
                setListening(false);
                if (!results.length) return;
                const ref = results.map(r => parseFrenchBibleRef(r)).find(Boolean);
                const q = ref ? `${ref.book} ${ref.chapter}:${ref.verse}` : results[0];
                setNav({ view: 'search', searchQuery: q });
              }}
              className={cn('h-9 w-9 rounded-lg border flex items-center justify-center shrink-0',
                listening ? 'border-red-500/60 bg-red-500/15 text-red-400 animate-pulse' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:text-foreground')}
              title="Chercher à la voix" aria-label="Chercher à la voix"
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

          {/* Bouton recherche */}
          <button
            onClick={() => {
              if (nav.view === 'search') setNav({ view: 'books', searchQuery: '' });
              else { setNav({ view: 'search' }); setTimeout(() => searchRef.current?.focus(), 50); }
            }}
            className={cn('h-9 w-9 rounded-lg border flex items-center justify-center transition-smooth shrink-0',
              nav.view === 'search'
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/40 bg-secondary/40 text-muted-foreground hover:text-foreground'
            )}
            title="Recherche"
          >
            {nav.view === 'search' ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Barre de recherche */}
        {nav.view === 'search' && (
          <Input
            ref={searchRef}
            value={nav.searchQuery}
            onChange={e => { setNav({ searchQuery: e.target.value }); setSearchBookFilter(null); }}
            placeholder="jn 3 16, ps 23 1-6 ou des mots…"
            className="h-11 text-base bg-secondary border-border/50"
          />
        )}

        {/* Filtre alphabétique (vue livres uniquement) */}
        {nav.view === 'books' && (
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setNav({ alphaFilter: null })}
              className={cn('px-2 py-0.5 rounded text-[10px] font-medium transition-smooth',
                !nav.alphaFilter ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >Tous</button>
            {ALPHA_LETTERS.map(l => (
              <button key={l}
                onClick={() => setNav({ alphaFilter: nav.alphaFilter === l ? null : l })}
                className={cn('px-2 py-0.5 rounded text-[10px] font-medium transition-smooth',
                  nav.alphaFilter === l ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >{l}</button>
            ))}
          </div>
        )}

        {/* Sélection multiple */}
        {nav.view === 'verses' && (
          <div className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-smooth flex-wrap',
            multiSelect ? 'bg-primary/10 border border-primary/30' : 'bg-transparent'
          )}>
            <button
              onClick={() => { setMultiSelect(!multiSelect); setSelectedVerses([]); }}
              className={cn(
                'text-xs font-medium px-3 py-1.5 rounded-lg border transition-smooth',
                multiSelect
                  ? 'border-primary/60 bg-primary/20 text-primary'
                  : 'border-border/50 bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary/90'
              )}
            >
              {multiSelect ? '✕ Annuler' : '☑ Sélection multiple'}
            </button>
            {multiSelect && (
              <button
                onClick={handleSelectAllChapter}
                className="text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-smooth"
                title="Sélectionner tout le chapitre"
              >
                Tout
              </button>
            )}
            {multiSelect && selectedVerses.length > 0 && (
              <>
                <button
                  onClick={() => setSelectedVerses([])}
                  className="text-[10px] px-2 py-1 rounded border border-border/40 text-muted-foreground hover:text-foreground transition-smooth"
                >
                  Désélect.
                </button>
                <button
                  onClick={() => { onAddMultipleVerses?.(selectedVerses); setSelectedVerses([]); setMultiSelect(false); }}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter {selectedVerses.length}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Zone de contenu */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">

        {/* Vue : Favoris */}
        {nav.view === 'favorites' && (
          <div className="space-y-1">
            {favorites.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Star className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Aucun favori enregistré.</p>
                <p className="text-xs text-muted-foreground/60">Appuyez sur ★ à côté d'un verset pour l'ajouter.</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground px-1 pb-1">{favorites.length} favori{favorites.length > 1 ? 's' : ''}</p>
                {favorites.map((fav, i) => {
                  const isProjected = currentProjectedVerse?.book === fav.book && currentProjectedVerse?.chapter === fav.chapter && currentProjectedVerse?.verse === fav.verse;
                  return (
                    <div key={i} className={cn(
                      'flex items-start gap-1 rounded-lg border transition-smooth',
                      isProjected ? 'border-primary/60 bg-primary/10' : 'border-border/30 bg-secondary/30 hover:bg-secondary/70 hover:border-primary/20'
                    )}>
                      <button
                        className="flex-1 text-left px-3 py-2.5"
                        onClick={() => handleSelectVerse(fav)}
                        onDoubleClick={() => handleDoubleClickVerse(fav)}
                      >
                        <div className="text-[10px] text-primary font-bold mb-0.5">{fav.book} {fav.chapter}:{fav.verse}</div>
                        <div className="text-xs text-foreground/80 leading-relaxed line-clamp-2">{fav.text}</div>
                      </button>
                      <button
                        onClick={() => toggleFavorite(fav)}
                        className="p-2.5 text-amber-400 shrink-0 hover:text-amber-300 transition-colors"
                        title="Retirer des favoris"
                      >
                        <Star className="h-3.5 w-3.5" fill="currentColor" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Vue : liste des livres */}
        {nav.view === 'books' && (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredBooks.map(book => {
              const isNT = BIBLE_BOOKS.indexOf(book) >= 39;
              return (
                <button
                  key={book}
                  onClick={() => setNav({ view: 'chapters', selectedBook: book, selectedChapter: null, alphaFilter: null })}
                  className="group flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/40 bg-secondary/40 hover:bg-secondary/80 hover:border-primary/30 transition-smooth text-left"
                >
                  <BookOpen className={cn('h-3.5 w-3.5 shrink-0', isNT ? 'text-blue-400' : 'text-amber-400')} />
                  <span className="text-xs text-foreground truncate font-medium">{book}</span>
                </button>
              );
            })}
            {filteredBooks.length === 0 && (
              <p className="col-span-2 text-center text-xs text-muted-foreground py-8">Aucun livre pour la lettre « {nav.alphaFilter} »</p>
            )}
          </div>
        )}

        {/* Vue : chapitres */}
        {nav.view === 'chapters' && nav.selectedBook && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground px-1">{nav.selectedBook}</h3>
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
              {chapters.map(ch => (
                <button
                  key={ch}
                  onClick={() => setNav({ view: 'verses', selectedChapter: ch })}
                  className="h-10 rounded-lg border border-border/40 bg-secondary/40 hover:bg-secondary/80 hover:border-primary/30 text-sm font-medium text-foreground transition-smooth"
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Vue : versets */}
        {nav.view === 'verses' && nav.selectedBook && nav.selectedChapter && (
          <div className="space-y-1">
            {verses.map(v => {
              const text = getVerseText(bible!, nav.selectedBook!, nav.selectedChapter!, v);
              const ref: VerseReference = { book: nav.selectedBook!, chapter: nav.selectedChapter!, verse: v, text };
              const isProjected = currentProjectedVerse?.book === nav.selectedBook && currentProjectedVerse?.chapter === nav.selectedChapter && currentProjectedVerse?.verse === v;
              const isSelected = multiSelect && selectedVerses.some(sv => sv.verse === v);
              const favored = isFavorite(ref);
              return (
                <div key={v} className={cn(
                  'flex items-start gap-1 rounded-lg border transition-smooth',
                  isProjected ? 'border-primary/60 bg-primary/10' : isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-secondary/30 hover:bg-secondary/70 hover:border-primary/20'
                )}>
                  <button
                    className="flex-1 text-left px-3 py-2.5"
                    onClick={() => {
                      if (multiSelect) { toggleMultiSelect(ref); return; }
                      handleSelectVerse(ref);
                    }}
                    onDoubleClick={() => !multiSelect && handleDoubleClickVerse(ref)}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('text-xs font-bold shrink-0 mt-0.5 w-6 text-right', isProjected ? 'text-primary' : 'text-muted-foreground')}>
                        {v}
                      </span>
                      <span className="text-xs text-foreground leading-relaxed flex-1">{text}</span>
                      {isProjected && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5 animate-pulse" />}
                    </div>
                  </button>
                  {!multiSelect && (
                    <button
                      onClick={() => toggleFavorite(ref)}
                      className={cn('p-2.5 shrink-0 transition-colors', favored ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400')}
                      title={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      <Star className="h-3 w-3" fill={favored ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Vue : recherche */}
        {nav.view === 'search' && (
          <div className="space-y-1">
            {nav.searchQuery.length < 2 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Tapez au moins 2 caractères pour rechercher…</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Aucun résultat pour « {nav.searchQuery} »</p>
            ) : (
              <>
                {/* Filtre par livre */}
                {booksInResults.length > 1 && (
                  <div className="flex gap-1 flex-wrap pb-2">
                    <button
                      onClick={() => setSearchBookFilter(null)}
                      className={cn('px-2 py-0.5 rounded text-[10px] font-medium transition-smooth',
                        !searchBookFilter ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground border border-border/40'
                      )}
                    >Tous ({searchResults.length})</button>
                    {booksInResults.map(book => (
                      <button key={book}
                        onClick={() => setSearchBookFilter(searchBookFilter === book ? null : book)}
                        className={cn('px-2 py-0.5 rounded text-[10px] font-medium transition-smooth',
                          searchBookFilter === book ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground border border-border/40'
                        )}
                      >{book}</button>
                    ))}
                  </div>
                )}

                {/* Passage entier (« ps 23 1-6 ») : tout ajouter d'un coup */}
                {onProjectPassage && filteredSearchResults.length > 1 && parseReference(nav.searchQuery) && (
                  <button onClick={() => onProjectPassage(filteredSearchResults.map(r => ({ book: r.book, chapter: r.chapter, verse: r.verse, text: r.text })))}
                    className="w-full h-11 mb-1 rounded-lg btn-gold text-sm font-semibold flex items-center justify-center gap-1.5">
                    <BookOpen className="h-4 w-4" /> Projeter le passage ({filteredSearchResults.length} versets)
                  </button>
                )}
                {onAddMultipleVerses && filteredSearchResults.length > 1 && parseReference(nav.searchQuery) && (
                  <button
                    onClick={() => {
                      onAddMultipleVerses(filteredSearchResults.map(r => ({ book: r.book, chapter: r.chapter, verse: r.verse, text: r.text })));
                      setAddedFlash(filteredSearchResults.length);
                      setTimeout(() => setAddedFlash(0), 2000);
                    }}
                    className="w-full h-11 mb-1 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center gap-1.5">
                    <Plus className="h-4 w-4" />
                    {addedFlash ? `${addedFlash} versets ajoutés au déroulé` : `Ajouter les ${filteredSearchResults.length} versets au déroulé`}
                  </button>
                )}
                {!isRefQuery && (
                  <button onClick={() => setAllVersions(v => !v)}
                    className={cn('w-full h-10 mb-1 rounded-lg border text-xs font-medium', allVersions ? 'border-sky-400/50 bg-sky-500/10 text-sky-200' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
                    {allVersions ? 'Dans LSG et Darby · toucher = comparer' : 'Chercher aussi dans Darby'}
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground px-1 pb-1">
                  {filteredSearchResults.length} résultat{filteredSearchResults.length > 1 ? 's' : ''}
                  {searchBookFilter ? ` dans ${searchBookFilter}` : ''}
                </p>
                {filteredSearchResults.map((r, i) => {
                  const ref: VerseReference = { book: r.book, chapter: r.chapter, verse: r.verse, text: r.text };
                  const ver = (r as { version?: string }).version;
                  const cmp = ver ? compareRef({ ...ref, version: ver }) : null;
                  const favored = isFavorite(ref);
                  return (
                    <div key={i} className="flex items-start gap-1 rounded-lg border border-border/30 bg-secondary/30 hover:bg-secondary/70 hover:border-primary/20 transition-smooth">
                      <button
                        className="flex-1 text-left px-3 py-2.5"
                        onClick={() => { if (cmp) { onSelectVerse(cmp.lsg); onSelectVerse2?.(cmp.other); } else handleSelectVerse(ref); }}
                        onDoubleClick={() => { if (cmp) { onSelectVerse(cmp.lsg); onSelectVerse2?.(cmp.other); onProjectVerse?.(cmp.lsg, cmp.other); } else handleDoubleClickVerse(ref); }}
                      >
                        <div className="text-[10px] text-primary font-bold mb-1 flex items-center gap-1.5">
                          {formatReference(ver ? { ...ref, version: ver } : ref)}
                          {allVersions && !isRefQuery && <span className={cn('px-1.5 rounded text-[9px] font-semibold', ver ? 'bg-sky-500/20 text-sky-300' : 'bg-primary/15 text-primary')}>{ver ?? 'LSG'}</span>}
                        </div>
                        <div className="text-xs text-foreground/80 leading-relaxed line-clamp-2">{r.text}</div>
                      </button>
                      <button
                        onClick={() => toggleFavorite(ref)}
                        className={cn('p-2.5 shrink-0 transition-colors', favored ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400')}
                        title={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      >
                        <Star className="h-3 w-3" fill={favored ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
