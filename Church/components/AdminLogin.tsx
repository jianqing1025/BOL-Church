
import React, { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import { CloseIcon } from './icons/Icons';

interface AdminLoginProps {
  onClose: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onClose }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAdmin();
  const { t } = useLocalization();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(password)) {
      onClose();
    } else {
      setError(t('admin.errorPassword'));
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm relative">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">{t('admin.loginTitle')}</h2>
          <button onClick={onClose} aria-label="Close login modal">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-600">{t('admin.loginTitle')}</p>
          <div>
            <label htmlFor="password-input" className="sr-only">{t('admin.passwordPlaceholder')}</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
              placeholder={t('admin.passwordPlaceholder')}
              autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('admin.loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
