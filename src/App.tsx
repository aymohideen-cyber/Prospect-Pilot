/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  MapPin, 
  Globe, 
  Mail, 
  FileText, 
  ChevronRight, 
  CheckCircle, 
  Copy, 
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Zap,
  RefreshCcw,
  Loader2
} from 'lucide-react';
import { CITIES, CITY_STATE_MAP, NICHES } from './constants';

interface Lead {
  name: string;
  website: string;
  address: string;
  place_id: string;
  foundEmail?: string;
  manualEmail?: string;
  audit?: {
    audit: string;
    emailSubject: string;
    emailBody: string;
    score: number;
  };
  status: 'pending' | 'scraping-email' | 'auditing' | 'completed' | 'failed';
}

export default function App() {
  const [niche, setNiche] = useState(NICHES[0].value);
  const [city, setCity] = useState(CITIES[0]);
  const [state, setState] = useState(CITY_STATE_MAP[CITIES[0]]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');

  useEffect(() => {
    setState(CITY_STATE_MAP[city] || '');
  }, [city]);

  const handleSearch = async () => {
    setIsSearching(true);
    setLeads([]);
    setSearchStatus('Scraping local leads...');
    
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          city, 
          state, 
          category: niche 
        }),
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const initialLeads: Lead[] = data.map((l: any) => ({
        ...l,
        status: 'pending'
      }));
      
      setLeads(initialLeads);
      processLeads(initialLeads);
    } catch (error: any) {
      console.error(error);
      setSearchStatus('Error: ' + error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const processLeads = async (leadsToProcess: Lead[]) => {
    for (let i = 0; i < leadsToProcess.length; i++) {
      const currentLead = leadsToProcess[i];
      
      // Update status to scraping email
      updateLeadStatus(i, 'scraping-email');
      
      try {
        // 1. Extract Email
        const emailRes = await fetch('/api/extract-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ website: currentLead.website }),
        });
        const emailData = await emailRes.json();
        
        setLeads(prev => {
          const next = [...prev];
          next[i].foundEmail = emailData.email;
          next[i].manualEmail = emailData.email || '';
          return next;
        });

        // 2. Audit & Draft
        updateLeadStatus(i, 'auditing');
        const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(currentLead.website)}&screenshot=true&embed=screenshot.url`;
        
        const auditRes = await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            website: currentLead.website,
            screenshotUrl
          }),
        });
        const auditData = await auditRes.json();
        
        setLeads(prev => {
          const next = [...prev];
          next[i].audit = auditData;
          next[i].status = 'completed';
          return next;
        });
      } catch (error) {
        updateLeadStatus(i, 'failed');
      }
    }
  };

  const updateLeadStatus = (index: number, status: Lead['status']) => {
    setLeads(prev => {
      const next = [...prev];
      next[index].status = status;
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">ProspectPilot</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Engine
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Section */}
        <section className="bg-slate-900 border border-white/5 rounded-2xl p-6 mb-8 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Niche</label>
              <select 
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
              >
                {NICHES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">City</label>
              <select 
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
              >
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">State</label>
              <input 
                type="text" 
                value={state}
                readOnly
                className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-4 py-2.5 text-slate-500 cursor-not-allowed outline-none"
              />
            </div>

            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]"
            >
              {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              {isSearching ? 'Scraping...' : 'Fire Away'}
            </button>
          </div>
          {isSearching && (
            <div className="mt-4 flex items-center gap-2 text-sm text-indigo-400 animate-pulse">
              <RefreshCcw className="w-4 h-4 animate-spin" />
              {searchStatus}
            </div>
          )}
        </section>

        {/* Results Section */}
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {leads.map((lead, index) => (
              <LeadCard key={`${lead.place_id}-${index}`} lead={lead} index={index} />
            ))}
          </AnimatePresence>
          
          {leads.length === 0 && !isSearching && (
            <div className="text-center py-20 bg-slate-900/30 rounded-3xl border border-dashed border-white/10">
              <Zap className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-400">No leads found yet.</h3>
              <p className="text-slate-500 text-sm mt-1">Select a niche and city to start prospecting.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LeadCard({ lead, index }: { lead: Lead; index: number }) {
  const [activeTab, setActiveTab] = useState<'audit' | 'email'>('audit');

  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-green-400 bg-green-400/10 border-green-400/20';
    if (score >= 50) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    return 'text-red-400 bg-red-400/10 border-red-400/20';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.1, 1) }}
      className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left: Lead Info */}
        <div className="lg:col-span-4 p-6 border-r border-white/5 bg-slate-900/50">
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{lead.name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                <MapPin className="w-3.5 h-3.5" />
                {lead.address}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a 
                href={lead.website} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
              >
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                Website
                <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-50" />
              </a>
              {lead.foundEmail && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-400">
                  <Mail className="w-3.5 h-3.5" />
                  {lead.foundEmail}
                  <button 
                    onClick={() => navigator.clipboard.writeText(lead.foundEmail!)}
                    className="ml-1 hover:text-white transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {!lead.foundEmail && lead.status === 'completed' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-medium text-slate-500">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Email needed
                </div>
              )}
            </div>

            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Status</span>
                {lead.status === 'completed' && <span className="text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ready</span>}
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ 
                    width: lead.status === 'pending' ? '5%' : 
                           lead.status === 'scraping-email' ? '40%' : 
                           lead.status === 'auditing' ? '75%' : 
                           lead.status === 'completed' ? '100%' : '0%'
                  }}
                  className={`h-full ${lead.status === 'failed' ? 'bg-red-500' : 'bg-indigo-500'}`}
                />
              </div>
              <div className="text-[10px] text-slate-500 italic">
                {lead.status === 'scraping-email' && 'Extracting contact info...'}
                {lead.status === 'auditing' && 'Capturing screenshot & auditing...'}
                {lead.status === 'completed' && 'Processing finished'}
                {lead.status === 'failed' && 'Error processing lead'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Content Tabs */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="flex border-b border-white/5 px-6">
            <button 
              onClick={() => setActiveTab('audit')}
              className={`py-4 px-4 text-sm font-medium transition-colors relative ${activeTab === 'audit' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Audit Detail
              </div>
              {activeTab === 'audit' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
            </button>
            <button 
              onClick={() => setActiveTab('email')}
              className={`py-4 px-4 text-sm font-medium transition-colors relative ${activeTab === 'email' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Cold Email
              </div>
              {activeTab === 'email' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
            </button>
          </div>

          <div className="p-6 flex-grow flex flex-col">
            {lead.status === 'completed' && lead.audit ? (
              <AnimatePresence mode="wait">
                {activeTab === 'audit' ? (
                  <motion.div 
                    key="audit"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-4 h-full"
                  >
                    <div className="flex items-start justify-between">
                      <div className={`px-3 py-1 rounded-full border text-xs font-bold ${scoreColor(lead.audit.score)}`}>
                        Audit Score: {lead.audit.score}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Findings</h4>
                        <p className="text-sm leading-relaxed text-slate-300">{lead.audit.audit}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 overflow-hidden bg-slate-950 aspect-video relative group">
                        <img 
                          src={`https://api.microlink.io?url=${encodeURIComponent(lead.website)}&screenshot=true&embed=screenshot.url`}
                          alt="Audit Preview"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-slate-900/20 group-hover:bg-transparent transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="email"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-4"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">To</label>
                      <input 
                        className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-indigo-400 outline-none"
                        value={lead.manualEmail || ''}
                        onChange={(e) => {}} // User can't edit in this simple demo but the field exists
                        placeholder="recipient@email.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Subject</label>
                      <div className="w-full bg-slate-800/30 border border-white/5 rounded-lg px-3 py-1.5 text-sm font-medium text-white italic">
                        {lead.audit.emailSubject}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Body</label>
                      <div className="w-full bg-slate-800/30 border border-white/5 rounded-lg px-3 py-4 text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {lead.audit.emailBody}
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                       <button 
                        onClick={() => {
                          const text = `Subject: ${lead.audit?.emailSubject}\n\n${lead.audit?.emailBody}`;
                          navigator.clipboard.writeText(text);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-all"
                       >
                        <Copy className="w-4 h-4" />
                        Copy Entire Draft
                       </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-600 space-y-4 py-12">
                {lead.status === 'failed' ? (
                   <>
                    <AlertCircle className="w-12 h-12 opacity-50 text-red-500" />
                    <p className="text-sm">Audit couldn't be generated for this site.</p>
                   </>
                ) : (
                  <>
                    <Loader2 className="w-12 h-12 animate-spin opacity-50" />
                    <p className="text-sm font-medium animate-pulse">Running AI analysis engine...</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}


