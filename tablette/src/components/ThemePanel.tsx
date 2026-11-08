/* Panneau de réglages du thème d'affichage */
import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { DisplayTheme } from '@/types/bible';

interface ThemePanelProps {
  theme: DisplayTheme;
  onChange: (theme: DisplayTheme) => void;
}

const THEMES = [
  { name: 'Noir classique', className: 'theme-noir-classique', color: '#0f0e1a' },
  { name: 'Bleu nuit', className: 'theme-bleu-nuit', color: '#0a1628' },
  { name: 'Bordeaux', className: 'theme-bordeaux', color: '#2a0a14' },
  { name: 'Forêt sombre', className: 'theme-foret-sombre', color: '#0a1f0f' },
  { name: 'Blanc lumineux', className: 'theme-blanc-lumineux', color: '#fafafa' },
];

const FONT_SIZES: { label: string; value: DisplayTheme['fontSize'] }[] = [
  { label: 'Petit', value: 'small' },
  { label: 'Moyen', value: 'medium' },
  { label: 'Grand', value: 'large' },
  { label: 'Très grand', value: 'xlarge' },
];

export default function ThemePanel({ theme, onChange }: ThemePanelProps) {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2 text-primary">
        <Palette className="h-5 w-5" />
        <h3 className="font-semibold">Thème d'affichage</h3>
      </div>

      {/* Thèmes prédéfinis */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">Fond d'écran TV</Label>
        <div className="flex gap-3">
          {THEMES.map(t => (
            <button
              key={t.className}
              onClick={() => onChange({ ...theme, name: t.name, className: t.className })}
              className={`w-10 h-10 rounded-full border-2 transition-smooth hover:scale-110 ${
                theme.className === t.className
                  ? 'border-primary ring-2 ring-primary/30 scale-110'
                  : 'border-border hover:border-primary/40'
              }`}
              style={{ backgroundColor: t.color }}
              title={t.name}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{theme.name}</p>
      </div>

      {/* Taille de police */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">Taille de police</Label>
        <div className="flex gap-2">
          {FONT_SIZES.map(fs => (
            <Button
              key={fs.value}
              size="sm"
              variant={theme.fontSize === fs.value ? 'default' : 'secondary'}
              onClick={() => onChange({ ...theme, fontSize: fs.value })}
              className="flex-1 text-xs transition-smooth"
            >
              {fs.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Famille de police */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">Police</Label>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={theme.fontFamily === 'serif' ? 'default' : 'secondary'}
            onClick={() => onChange({ ...theme, fontFamily: 'serif' })}
            className="flex-1 font-serif transition-smooth"
          >
            Serif
          </Button>
          <Button
            size="sm"
            variant={theme.fontFamily === 'sans-serif' ? 'default' : 'secondary'}
            onClick={() => onChange({ ...theme, fontFamily: 'sans-serif' })}
            className="flex-1 transition-smooth"
          >
            Sans-serif
          </Button>
        </div>
      </div>

      {/* Opacité du fond */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">
          Opacité du fond : {Math.round(theme.bgOpacity * 100)}%
        </Label>
        <Slider
          value={[theme.bgOpacity * 100]}
          onValueChange={([v]) => onChange({ ...theme, bgOpacity: v / 100 })}
          max={100}
          step={5}
          className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary"
        />
      </div>
    </div>
  );
}
