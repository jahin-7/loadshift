import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth.js';
import * as api from '../lib/api.js';
import { getTheme, setTheme, type Theme } from '../lib/theme.js';

export default function SettingsView() {
  const { user, refreshUser } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getTheme());

  function handleThemeChange(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  const [shopName, setShopName] = useState(user?.shopName ?? '');
  const [litersPerHour, setLitersPerHour] = useState(String(user?.generatorLitersPerHour ?? ''));
  const [pricePerLiter, setPricePerLiter] = useState(String(user?.fuelPricePerLiter ?? ''));
  const [hasGenerator, setHasGenerator] = useState(user?.hasGenerator ?? true);
  const [hasSolar, setHasSolar] = useState(user?.hasSolar ?? false);
  const [solarStart, setSolarStart] = useState(user?.solarStart ?? '06:00');
  const [solarEnd, setSolarEnd] = useState(user?.solarEnd ?? '18:00');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const patch: api.SettingsPatch = {
        shopName: shopName.trim(),
        generatorLitersPerHour: Number(litersPerHour),
        fuelPricePerLiter: Number(pricePerLiter),
        hasGenerator,
        hasSolar,
      };
      if (hasSolar) {
        patch.solarStart = solarStart;
        patch.solarEnd = solarEnd;
      }
      const { user: updated } = await api.updateSettings(patch);
      refreshUser(updated);
      setSaved(true);
    } catch {
      setError('Could not save settings.');
    }
  }

  return (
    <div className="settings-view">
      <h1>Settings</h1>

      <div className="settings-form settings-form--theme">
        <span className="settings-form__section-title">Appearance</span>
        <div className="theme-toggle">
          <button
            type="button"
            className={theme === 'dark' ? 'is-active' : ''}
            onClick={() => handleThemeChange('dark')}
          >
            Dark
          </button>
          <button
            type="button"
            className={theme === 'light' ? 'is-active' : ''}
            onClick={() => handleThemeChange('light')}
          >
            Light
          </button>
        </div>
      </div>

      <p className="muted">
        These generator numbers become the default cost basis for every new plan you create — existing plans keep the
        rate they were created with, so past costs stay accurate even if fuel prices change later.
      </p>
      <form className="settings-form" onSubmit={handleSubmit}>
        <label>
          Shop name
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} required />
        </label>

        <div className="settings-form__section">
          <span className="settings-form__section-title">Power sources</span>
          <label className="settings-form__checkbox">
            <input type="checkbox" checked={hasGenerator} onChange={(e) => setHasGenerator(e.target.checked)} />
            Diesel generator
          </label>
          <label className="settings-form__checkbox">
            <input type="checkbox" checked={hasSolar} onChange={(e) => setHasSolar(e.target.checked)} />
            Solar panels
          </label>
        </div>

        {hasSolar && (
          <div className="builder-row">
            <label>
              Solar available from
              <input type="time" value={solarStart} onChange={(e) => setSolarStart(e.target.value)} required />
            </label>
            <label>
              Until
              <input type="time" value={solarEnd} onChange={(e) => setSolarEnd(e.target.value)} required />
            </label>
          </div>
        )}

        <label>
          Generator fuel use (liters / hour)
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={litersPerHour}
            onChange={(e) => setLitersPerHour(e.target.value)}
            disabled={!hasGenerator}
            required={hasGenerator}
          />
        </label>
        <label>
          Fuel price (currency / liter)
          <input
            type="number"
            min="1"
            step="0.5"
            value={pricePerLiter}
            onChange={(e) => setPricePerLiter(e.target.value)}
            disabled={!hasGenerator}
            required={hasGenerator}
          />
        </label>

        {error && <div className="form-error">{error}</div>}
        {saved && <div className="form-success">Saved.</div>}

        <button type="submit">Save settings</button>
      </form>
    </div>
  );
}
