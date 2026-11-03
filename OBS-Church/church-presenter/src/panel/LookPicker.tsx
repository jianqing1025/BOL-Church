import { Check } from 'lucide-react';
import { t } from '../shared/i18n';
import { LAYOUTS, type Look } from '../shared/model';
import { sampleSpec } from '../shared/render';
import { THEME_GROUPS, THEMES, themeName, themeSwatchCss } from '../shared/themes';
import { Thumb } from './Thumb';

/** Background theme and layout: choose on the left, live preview on the right. */
export function LookPicker({ value, onChange, inherited, onInherit }: {
  value: Look;
  onChange: (look: Look) => void;
  /** For an item: it is using the default look. */
  inherited?: boolean;
  onInherit?: () => void;
}) {
  return (
    <div className="look-picker">
      <div className="look-options">
        {onInherit && (
          <label className="look-inherit">
            <input type="checkbox" checked={!!inherited} onChange={(e) => (e.target.checked ? onInherit() : onChange(value))} />
            {t('look.useDefault')}
          </label>
        )}
        <h4>{t('look.layout')}</h4>
        <div className="layout-row">
          {LAYOUTS.map((layout) => (
            <button key={layout.id} type="button" title={layout.hint}
              className={`chip${value.layout === layout.id ? ' on' : ''}`}
              onClick={() => onChange({ ...value, layout: layout.id })}>
              {layout.name}
            </button>
          ))}
        </div>
        {THEME_GROUPS.map((group) => (
          <section key={group.id}>
            <h4>{group.name}</h4>
            <div className="swatch-grid">
              {THEMES.filter((theme) => theme.group === group.id).map((theme) => (
                <button key={theme.id} type="button" className={`swatch${value.themeId === theme.id ? ' on' : ''}`}
                  title={themeName(theme)} onClick={() => onChange({ ...value, themeId: theme.id })}>
                  <span className="swatch-fill" style={{ background: themeSwatchCss(theme) }}>
                    <span style={{ color: theme.title }}>Aa</span>
                    {value.themeId === theme.id && <Check className="swatch-check" size={16} />}
                  </span>
                  <span className="swatch-name">{themeName(theme)}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="look-preview">
        <Thumb spec={sampleSpec(value)} />
        <p>{LAYOUTS.find((l) => l.id === value.layout)?.hint}</p>
      </div>
    </div>
  );
}
