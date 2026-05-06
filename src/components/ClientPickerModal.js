import React, { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus, User, X } from 'lucide-react';
import api from '../services/api';
import AddManagedClientModal from './AddManagedClientModal';

// In-flow client switcher used from the booking form. Lists the provider's
// clients (registered + managed, merged), supports search, and offers an
// "Add new client" entry that opens the managed-client create modal without
// leaving the booking flow.
const ClientPickerModal = ({ currentClientId, onSelect, onClose, canDismiss = true }) => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const fetchClients = async () => {
    try {
      const res = await api.get('/api/users/provider/clients');
      setClients(res.data || []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...clients].sort((a, b) => {
      const an = (a.profile?.fullName || '').toLowerCase();
      const bn = (b.profile?.fullName || '').toLowerCase();
      return an.localeCompare(bn);
    });
    if (!q) return list;
    return list.filter(c => {
      const name = (c.profile?.fullName || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.profile?.phoneNumber || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [clients, query]);

  const handleNewClientCreated = (newClient) => {
    setShowAdd(false);
    setClients(prev => [newClient, ...prev]);
    onSelect(newClient);
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-40">
        <div className="bg-paper-elev rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col">
          <div className="p-5 border-b border-line flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Book for which client?</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a client or add a new one.</p>
            </div>
            {canDismiss && (
              <button
                onClick={onClose}
                className="p-1 text-slate-500 hover:text-slate-600 rounded"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="p-4 border-b border-line">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or phone"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#B07A4E] focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center gap-3 p-4 border-b border-line hover:bg-paper-deep transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[#B07A4E]/10 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-5 h-5 text-[#B07A4E]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#B07A4E]">Add new client</p>
                <p className="text-xs text-slate-500">For someone who isn't using the app</p>
              </div>
            </button>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading clients…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {query.trim() ? `No clients match "${query}"` : 'No clients yet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filtered.map(client => {
                  const isCurrent = client._id === currentClientId;
                  return (
                    <button
                      key={client._id}
                      onClick={() => onSelect(client)}
                      className={`w-full flex items-center gap-3 p-4 hover:bg-paper-deep transition-colors text-left ${
                        isCurrent ? 'bg-[#B07A4E]/5' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {client.profile?.fullName || 'Unnamed client'}
                          </p>
                          {client.isManaged && (
                            <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">
                              Managed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {client.email || client.profile?.phoneNumber || 'No contact info'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <AddManagedClientModal
          onClose={() => setShowAdd(false)}
          onCreated={handleNewClientCreated}
        />
      )}
    </>
  );
};

export default ClientPickerModal;
