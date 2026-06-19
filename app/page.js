"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, Trash2, Pencil, Loader2, CheckCircle2, Circle, X, Sun, Moon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

const ORANGE = '#E8622A';
const GOLD = '#C9A227';
const WARN = '#C2785A';

const THEMES = {
    dark: {
        bg: '#15140F',
        surface: '#1C1A14',
        border: '#332F25',
        text: '#EDE9E0',
        muted: '#8A8678',
        faint: '#6B6759',
        orangeSoft: 'rgba(232,98,42,0.16)'
    },
    light: {
        bg: '#F9F8F6',
        surface: '#FFFFFF',
        border: '#E8E5DC',
        text: '#201F1C',
        muted: '#7E7B70',
        faint: '#AFA99B',
        orangeSoft: 'rgba(232,98,42,0.08)'
    }
};

const OWNER_COLORS = { Sangeet: ORANGE, Shivam: GOLD, Common: '#8A8678' };

function cycleOwner(current) {
    if (current === 'Sangeet') return 'Shivam';
    if (current === 'Shivam') return 'Common';
    return 'Sangeet';
}

const STAGES = ['New Lead', 'Contacted', 'Audit Sent', 'Negotiating', 'Won', 'Lost'];
const STAGE_COLORS = {
    'New Lead': '#8A8780',
    Contacted: GOLD,
    'Audit Sent': '#3E7CB1',
    Negotiating: ORANGE,
    Won: '#5B8C5A',
    Lost: '#8A4B4B'
};

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
    const d1 = new Date(a);
    const d2 = new Date(b);
    return Math.round((d2 - d1) / 86400000);
}

async function callClaudeAPI(prompt, mcpServers) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }],
            ...(mcpServers ? { mcp_servers: mcpServers } : {})
        })
    });
    if (!res.ok) throw new Error('API error: ' + res.status);
    const data = await res.json();
    return (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
}

function parseJsonArray(text) {
    if (!text) return null;
    const clean = text.replace(/```json|```/g, '').trim();
    try {
        const parsed = JSON.parse(clean);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function loadShared(key, fallback) {
    try {
        const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error('Load failed');
        const data = await res.json();
        if (!data || data.value === undefined || data.value === null) return fallback;
        return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } catch (e) {
        console.error('Storage load failed for', key, e);
        return fallback;
    }
}

async function saveShared(key, value) {
    try {
        const res = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: JSON.stringify(value) })
        });
        if (!res.ok) throw new Error('Save failed');
        return true;
    } catch (e) {
        console.error('Storage save failed for', key, e);
        return false;
    }
}

export default function CommandCenter() {
    const [theme, setTheme] = useState('dark');
    const [ready, setReady] = useState(false);
    const [author, setAuthor] = useState('Sangeet');

    const [northStar, setNorthStar] = useState({
        mission: '',
        sprintGoal: '',
        revenueTarget: 0,
        sprintStart: todayStr(),
        sprintEnd: todayStr()
    });
    const [editingNorthStar, setEditingNorthStar] = useState(false);
    const [nsDraft, setNsDraft] = useState(northStar);

    const [history, setHistory] = useState([]);
    const [revenue, setRevenue] = useState([]);
    const [crm, setCrm] = useState([]);
    const [ideas, setIdeas] = useState([]);
    const [docLinks, setDocLinks] = useState({});
    const [emailLog, setEmailLog] = useState([]);
    const [emailGoal, setEmailGoal] = useState(50);

    const [draftPriorities, setDraftPriorities] = useState([{ text: '', done: false, owner: 'Sangeet' }]);
    const [draftShipped, setDraftShipped] = useState('');
    const [draftLearning, setDraftLearning] = useState('');
    const [savedTodayAt, setSavedTodayAt] = useState(null);

    const [tasks, setTasks] = useState(null);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [tasksError, setTasksError] = useState('');

    const [events, setEvents] = useState(null);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsError, setEventsError] = useState('');

    const [revDraft, setRevDraft] = useState({ date: todayStr(), amount: '', source: '' });
    const [crmDraft, setCrmDraft] = useState({ name: '', company: '', stage: 'New Lead' });
    const [ideaDraft, setIdeaDraft] = useState('');

    const t = THEMES[theme] || THEMES.dark;

    useEffect(() => {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme && THEMES[storedTheme]) {
            setTheme(storedTheme);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.body.style.backgroundColor = t.bg;
    }, [theme, t]);

    useEffect(() => {
        (async () => {
            const [ns, hist, rev, crmData, ideaData, links, emails, goal] = await Promise.all([
                loadShared('northstar', null),
                loadShared('daily-history', []),
                loadShared('revenue-log', []),
                loadShared('crm-log', []),
                loadShared('idea-log', []),
                loadShared('doc-links', {}),
                loadShared('email-log', []),
                loadShared('email-goal', 50)
            ]);
            if (ns) {
                setNorthStar(ns);
                setNsDraft(ns);
            }
            setHistory(hist || []);
            setRevenue(rev || []);
            setCrm(crmData || []);
            setIdeas(ideaData || []);
            setDocLinks(links || {});
            setEmailLog(emails || []);
            setEmailGoal(goal || 50);
            setReady(true);
        })();
    }, []);

    useEffect(() => {
        if (!ready) return;
        const today = todayStr();
        const todayRecord = history.find((d) => d.date === today);
        if (todayRecord) {
            setDraftPriorities(todayRecord.priorities && todayRecord.priorities.length ? todayRecord.priorities : [{ text: '', done: false, owner: author }]);
            setDraftShipped((todayRecord.shipped || []).join('\n'));
            setDraftLearning(todayRecord.learning || '');
        } else {
            const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));
            const yesterday = sorted[0];
            const carried = yesterday
                ? (yesterday.priorities || [])
                    .filter((p) => p.text && !p.done)
                    .map((p) => ({ text: p.text, done: false, carried: true, owner: p.owner || 'Common' }))
                : [];
            setDraftPriorities(carried.length ? carried : [{ text: '', done: false, owner: author }]);
            setDraftShipped('');
            setDraftLearning('');
        }
    }, [ready, history.length]);

    function updatePriority(idx, field, value) {
        setDraftPriorities((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
    }
    function addPriorityRow() {
        setDraftPriorities((prev) => {
            const visibleCount = prev.filter((p) => p.owner === 'Common' || p.owner === author || !p.owner).length;
            if (visibleCount >= 3) return prev;
            return [...prev, { text: '', done: false, owner: author }];
        });
    }
    function removePriorityRow(idx) {
        setDraftPriorities((prev) => prev.filter((_, i) => i !== idx));
    }

    async function saveToday() {
        const today = todayStr();
        const record = {
            date: today,
            priorities: draftPriorities.filter((p) => p.text.trim()),
            shipped: draftShipped.split('\n').map((s) => s.trim()).filter(Boolean),
            learning: draftLearning.trim(),
            author
        };
        const others = history.filter((d) => d.date !== today);
        const updated = [...others, record].sort((a, b) => (a.date < b.date ? -1 : 1));
        setHistory(updated);
        await saveShared('daily-history', updated);
        setSavedTodayAt(new Date().toLocaleTimeString());
    }

    async function saveNorthStar() {
        const cleaned = { ...nsDraft, revenueTarget: Number(nsDraft.revenueTarget) || 0 };
        setNorthStar(cleaned);
        await saveShared('northstar', cleaned);
        setEditingNorthStar(false);
    }

    async function syncTasks() {
        setTasksLoading(true);
        setTasksError('');
        try {
            const prompt =
                'List my open or in-progress Linear issues across every team I can see, sorted urgent first. Limit to 12. Respond with ONLY a JSON array (no markdown fences, no commentary), each item shaped like {"title":"","status":"","priority":"","project":""}. If there are none, respond with [].';
            const text = await callClaudeAPI(prompt, [{ type: 'url', url: 'https://mcp.linear.app/mcp', name: 'linear-mcp' }]);
            const parsed = parseJsonArray(text);
            if (parsed) setTasks(parsed);
            else {
                setTasks([]);
                setTasksError("Got a response but couldn't read it as a task list. Try syncing again.");
            }
        } catch (e) {
            setTasks([]);
            setTasksError('Could not reach Linear. Check that your Linear connector is on.');
        } finally {
            setTasksLoading(false);
        }
    }

    async function syncEvents() {
        setEventsLoading(true);
        setEventsError('');
        try {
            const today = todayStr();
            const prompt = `Today's date is ${today}. List everything on my Google Calendar for ${today} only, sorted by start time. Respond with ONLY a JSON array (no markdown fences, no commentary), each item shaped like {"title":"","start":"","end":"","location":""}. If there are no events, respond with [].`;
            const text = await callClaudeAPI(prompt, [{ type: 'url', url: 'https://calendarmcp.googleapis.com/mcp/v1', name: 'calendar-mcp' }]);
            const parsed = parseJsonArray(text);
            if (parsed) setEvents(parsed);
            else {
                setEvents([]);
                setEventsError("Got a response but couldn't read it as an event list. Try syncing again.");
            }
        } catch (e) {
            setEvents([]);
            setEventsError('Could not reach Google Calendar. Check that your Calendar connector is on.');
        } finally {
            setEventsLoading(false);
        }
    }

    async function addRevenue() {
        if (!revDraft.amount || isNaN(parseFloat(revDraft.amount))) return;
        const entry = {
            id: Date.now().toString(36),
            date: revDraft.date,
            amount: parseFloat(revDraft.amount),
            source: revDraft.source.trim()
        };
        const updated = [...revenue, entry];
        setRevenue(updated);
        await saveShared('revenue-log', updated);
        setRevDraft({ date: todayStr(), amount: '', source: '' });
    }
    async function deleteRevenue(id) {
        const updated = revenue.filter((r) => r.id !== id);
        setRevenue(updated);
        await saveShared('revenue-log', updated);
    }

    async function addCrm() {
        if (!crmDraft.name.trim()) return;
        const entry = {
            id: Date.now().toString(36),
            name: crmDraft.name.trim(),
            company: crmDraft.company.trim(),
            stage: crmDraft.stage,
            lastContact: todayStr(),
            owner: author
        };
        const updated = [entry, ...crm];
        setCrm(updated);
        await saveShared('crm-log', updated);
        setCrmDraft({ name: '', company: '', stage: 'New Lead' });
    }
    async function updateCrmStage(id, stage) {
        const updated = crm.map((c) => (c.id === id ? { ...c, stage, lastContact: todayStr() } : c));
        setCrm(updated);
        await saveShared('crm-log', updated);
    }
    async function deleteCrm(id) {
        const updated = crm.filter((c) => c.id !== id);
        setCrm(updated);
        await saveShared('crm-log', updated);
    }

    async function addIdea() {
        if (!ideaDraft.trim()) return;
        const entry = { id: Date.now().toString(36), date: todayStr(), author, idea: ideaDraft.trim(), status: 'parked' };
        const updated = [entry, ...ideas];
        setIdeas(updated);
        await saveShared('idea-log', updated);
        setIdeaDraft('');
    }
    async function setIdeaStatus(id, status) {
        const updated = ideas.map((i) => (i.id === id ? { ...i, status } : i));
        setIdeas(updated);
        await saveShared('idea-log', updated);
    }
    async function deleteIdea(id) {
        const updated = ideas.filter((i) => i.id !== id);
        setIdeas(updated);
        await saveShared('idea-log', updated);
    }

    async function updateDocLink(key, value) {
        const updated = { ...docLinks, [key]: value };
        setDocLinks(updated);
        await saveShared('doc-links', updated);
    }

    async function adjustEmail(field, delta) {
        const today = todayStr();
        const existing = emailLog.find((d) => d.date === today);
        let updated;
        if (existing) {
            updated = emailLog.map((d) => (d.date === today ? { ...d, [field]: Math.max(0, (d[field] || 0) + delta) } : d));
        } else {
            const blank = { date: today, sent: 0, positive: 0, negative: 0, meetings: 0 };
            blank[field] = Math.max(0, delta);
            updated = [...emailLog, blank];
        }
        setEmailLog(updated);
        await saveShared('email-log', updated);
    }

    async function updateEmailGoal(value) {
        const num = Math.max(0, parseInt(value, 10) || 0);
        setEmailGoal(num);
        await saveShared('email-goal', num);
    }

    const sprintLen = Math.max(1, daysBetween(northStar.sprintStart, northStar.sprintEnd) + 1);
    const dayIndex = Math.min(sprintLen, Math.max(1, daysBetween(northStar.sprintStart, todayStr()) + 1));
    const daysLeft = Math.max(0, daysBetween(todayStr(), northStar.sprintEnd));
    const sprintRevenue = revenue
        .filter((r) => r.date >= northStar.sprintStart && r.date <= northStar.sprintEnd)
        .reduce((s, r) => s + Number(r.amount || 0), 0);
    const revenuePct = Number(northStar.revenueTarget) > 0 ? Math.min(100, Math.round((sprintRevenue / Number(northStar.revenueTarget)) * 100)) : 0;

    const chartData = (() => {
        const map = {};
        revenue.forEach((r) => {
            map[r.date] = (map[r.date] || 0) + Number(r.amount || 0);
        });
        return Object.keys(map)
            .sort()
            .slice(-14)
            .map((d) => ({ date: d.slice(5), amount: map[d] }));
    })();

    const recentHistory = [...history].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);

    const visiblePriorities = draftPriorities
        .map((p, i) => ({ ...p, _idx: i }))
        .filter((p) => p.owner === 'Common' || p.owner === author || !p.owner);

    const today = todayStr();
    const todayEmailRecord = emailLog.find((d) => d.date === today);
    const todaySent = todayEmailRecord ? todayEmailRecord.sent || 0 : 0;
    const emailGoalPct = emailGoal > 0 ? Math.min(100, Math.round((todaySent / emailGoal) * 100)) : 0;
    const totalSent = emailLog.reduce((s, d) => s + (d.sent || 0), 0);
    const totalPositive = emailLog.reduce((s, d) => s + (d.positive || 0), 0);
    const totalNegative = emailLog.reduce((s, d) => s + (d.negative || 0), 0);
    const totalMeetings = emailLog.reduce((s, d) => s + (d.meetings || 0), 0);
    const replyRate = totalSent > 0 ? Math.round(((totalPositive + totalNegative) / totalSent) * 100) : 0;
    const positiveRate = totalPositive + totalNegative > 0 ? Math.round((totalPositive / (totalPositive + totalNegative)) * 100) : 0;
    const emailChartData = [...emailLog]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-14)
        .map((d) => ({ date: d.date.slice(5), sent: d.sent || 0 }));

    function inputStyle(extra) {
        return { backgroundColor: t.bg, color: t.text, border: `1px solid ${t.border}`, ...extra };
    }

    function Card({ eyebrow, title, action, children }) {
        return (
            <div className="rounded-2xl p-5 sm:p-6 border transition-all duration-200" style={{ backgroundColor: t.surface, borderColor: t.border }}>
                <div className="flex items-center justify-between mb-4 gap-2">
                    <div>
                        <div className="text-xs tracking-widest uppercase mb-1" style={{ color: ORANGE }}>
                            {eyebrow}
                        </div>
                        <h2 className="text-lg font-semibold" style={{ color: t.text }}>
                            {title}
                        </h2>
                    </div>
                    {action}
                </div>
                {children}
            </div>
        );
    }

    if (!ready) {
        return (
            <div style={{ backgroundColor: t.bg }} className="min-h-screen flex items-center justify-center transition-colors duration-200">
                <Loader2 className="animate-spin text-zinc-400" size={28} />
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: t.bg, color: t.text }} className="min-h-screen w-full font-sans transition-colors duration-200">
            <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
                    <div>
                        <div className="text-xs tracking-widest uppercase" style={{ color: t.muted }}>
                            SETHZ.CO — SUPER SCALZ PRIVATE LIMITED
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold mt-1" style={{ color: t.text }}>
                            Command Center
                        </h1>
                        <div className="text-sm mt-1" style={{ color: t.faint }}>
                            One source of truth for focus, tasks, pipeline and revenue — shared with Shivam.
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="p-2 rounded-full border transition-all duration-200 hover:opacity-80"
                            style={{ borderColor: t.border, color: t.muted, backgroundColor: t.surface }}
                            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setAuthor('Sangeet')}
                                className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200"
                                style={author === 'Sangeet' ? { backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF', borderColor: ORANGE } : { borderColor: t.border, color: t.muted, backgroundColor: t.surface }}
                            >
                                Sangeet
                            </button>
                            <button
                                onClick={() => setAuthor('Shivam')}
                                className="px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200"
                                style={author === 'Shivam' ? { backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF', borderColor: ORANGE } : { borderColor: t.border, color: t.muted, backgroundColor: t.surface }}
                            >
                                Shivam
                            </button>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl p-5 sm:p-6 mt-5 mb-6 border transition-all duration-200" style={{ backgroundColor: t.surface, borderColor: t.border }}>
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div>
                            <div className="text-xs tracking-widest uppercase mb-1" style={{ color: t.muted }}>
                                Current sprint goal
                            </div>
                            {northStar.sprintGoal ? (
                                <div className="text-base sm:text-lg" style={{ color: t.text }}>
                                    {northStar.sprintGoal}
                                </div>
                            ) : (
                                <div className="text-base italic" style={{ color: t.faint }}>
                                    No sprint goal set yet — click Edit to set one.
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setEditingNorthStar((v) => !v)}
                            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border flex-shrink-0"
                            style={{ borderColor: t.border, color: GOLD }}
                        >
                            <Pencil size={14} /> Edit
                        </button>
                    </div>

                    {editingNorthStar && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 p-4 rounded-xl" style={{ backgroundColor: t.bg }}>
                            <label className="text-sm">
                                <span className="block mb-1" style={{ color: t.muted }}>
                                    Sprint goal
                                </span>
                                <input
                                    value={nsDraft.sprintGoal}
                                    onChange={(e) => setNsDraft({ ...nsDraft, sprintGoal: e.target.value })}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={inputStyle()}
                                    placeholder="e.g. Close 3 FFOS clients"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="block mb-1" style={{ color: t.muted }}>
                                    Mission (one line)
                                </span>
                                <input
                                    value={nsDraft.mission}
                                    onChange={(e) => setNsDraft({ ...nsDraft, mission: e.target.value })}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={inputStyle()}
                                    placeholder="Why Sethz.co exists"
                                />
                            </label>
                            <label className="text-sm">
                                <span className="block mb-1" style={{ color: t.muted }}>
                                    Revenue target ($)
                                </span>
                                <input
                                    type="number"
                                    value={nsDraft.revenueTarget}
                                    onChange={(e) => setNsDraft({ ...nsDraft, revenueTarget: e.target.value })}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={inputStyle()}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-sm">
                                    <span className="block mb-1" style={{ color: t.muted }}>
                                        Sprint start
                                    </span>
                                    <input
                                        type="date"
                                        value={nsDraft.sprintStart}
                                        onChange={(e) => setNsDraft({ ...nsDraft, sprintStart: e.target.value })}
                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                        style={inputStyle()}
                                    />
                                </label>
                                <label className="text-sm">
                                    <span className="block mb-1" style={{ color: t.muted }}>
                                        Sprint end
                                    </span>
                                    <input
                                        type="date"
                                        value={nsDraft.sprintEnd}
                                        onChange={(e) => setNsDraft({ ...nsDraft, sprintEnd: e.target.value })}
                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                        style={inputStyle()}
                                    />
                                </label>
                            </div>
                            <div className="sm:col-span-2 flex justify-end">
                                <button onClick={saveNorthStar} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF' }}>
                                    Save
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-1 mb-3">
                        {Array.from({ length: sprintLen }).map((_, i) => (
                            <div key={i} className="h-2 flex-1 rounded-full" style={{ backgroundColor: i < dayIndex ? ORANGE : t.border }} />
                        ))}
                    </div>
                    <div className="flex justify-between text-xs mb-5" style={{ color: t.muted }}>
                        <span>
                            Day {dayIndex} of {sprintLen}
                        </span>
                        <span>
                            {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                        </span>
                    </div>

                    <div className="flex justify-between text-xs mb-1.5" style={{ color: t.muted }}>
                        <span>Revenue this sprint</span>
                        <span>
                            ${sprintRevenue.toLocaleString('en-US')} / ${Number(northStar.revenueTarget || 0).toLocaleString('en-US')}
                        </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: t.border }}>
                        <div className="h-full rounded-full" style={{ width: `${revenuePct}%`, backgroundColor: ORANGE }} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Card
                        eyebrow="Today"
                        title="Priorities"
                        action={savedTodayAt ? <span className="text-xs" style={{ color: t.faint }}>Saved {savedTodayAt}</span> : null}
                    >
                        <div className="space-y-2 mb-3">
                            {visiblePriorities.map((p) => (
                                <div key={p._idx} className="flex items-center gap-2 flex-wrap">
                                    <button onClick={() => updatePriority(p._idx, 'done', !p.done)}>
                                        {p.done ? <CheckCircle2 size={18} style={{ color: ORANGE }} /> : <Circle size={18} style={{ color: t.faint }} />}
                                    </button>
                                    <input
                                        value={p.text}
                                        onChange={(e) => updatePriority(p._idx, 'text', e.target.value)}
                                        placeholder={p.carried ? 'Carried over from yesterday' : 'New priority'}
                                        className="flex-1 rounded-lg px-3 py-2 text-sm min-w-0"
                                        style={{
                                            backgroundColor: t.bg,
                                            color: p.done ? t.faint : t.text,
                                            border: p.carried ? `1px solid ${ORANGE}` : `1px solid ${t.border}`,
                                            textDecoration: p.done ? 'line-through' : 'none'
                                        }}
                                    />
                                    <button
                                        onClick={() => updatePriority(p._idx, 'owner', cycleOwner(p.owner || author))}
                                        className="text-xs px-2 py-1 rounded-full border flex-shrink-0"
                                        style={{ borderColor: OWNER_COLORS[p.owner] || t.muted, color: OWNER_COLORS[p.owner] || t.muted }}
                                    >
                                        {p.owner || 'Common'}
                                    </button>
                                    <button onClick={() => removePriorityRow(p._idx)}>
                                        <X size={16} style={{ color: t.faint }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="text-xs mb-3" style={{ color: t.faint }}>
                            Tap the name pill to mark a priority Sangeet-only, Shivam-only, or Common. Common stays visible to both; the rest only shows on its owner's view.
                        </div>
                        {visiblePriorities.length < 3 && (
                            <button onClick={addPriorityRow} className="flex items-center gap-1 text-sm mb-4" style={{ color: GOLD }}>
                                <Plus size={14} /> Add priority
                            </button>
                        )}
                        <div className="mb-3">
                            <span className="block text-xs mb-1" style={{ color: t.muted }}>
                                Shipped today (one per line)
                            </span>
                            <textarea
                                value={draftShipped}
                                onChange={(e) => setDraftShipped(e.target.value)}
                                rows={2}
                                className="w-full rounded-lg px-3 py-2 text-sm"
                                style={inputStyle()}
                            />
                        </div>
                        <div className="mb-4">
                            <span className="block text-xs mb-1" style={{ color: t.muted }}>
                                One learning
                            </span>
                            <input value={draftLearning} onChange={(e) => setDraftLearning(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle()} />
                        </div>
                        <button onClick={saveToday} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF' }}>
                            Save today's log
                        </button>
                    </Card>

                    <Card eyebrow="Live" title="Tasks &amp; meetings">
                        <div className="mb-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium" style={{ color: t.text }}>
                                    Linear tasks
                                </span>
                                <button
                                    onClick={syncTasks}
                                    disabled={tasksLoading}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                                    style={{ borderColor: t.border, color: GOLD }}
                                >
                                    {tasksLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync
                                </button>
                            </div>
                            {tasksError && (
                                <div className="text-xs mb-2" style={{ color: WARN }}>
                                    {tasksError}
                                </div>
                            )}
                            {tasks === null && !tasksError && (
                                <div className="text-xs italic" style={{ color: t.faint }}>
                                    Not synced yet.
                                </div>
                            )}
                            {tasks && tasks.length === 0 && !tasksError && (
                                <div className="text-xs italic" style={{ color: t.faint }}>
                                    Nothing open. Clean board.
                                </div>
                            )}
                            <div className="space-y-1.5">
                                {(tasks || []).map((t, i) => (
                                    <div key={i} className="text-sm flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: t.bg }}>
                                        <span style={{ color: t.text }}>{t.title}</span>
                                        <span className="text-xs" style={{ color: t.muted }}>
                                            {t.priority || t.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium" style={{ color: t.text }}>
                                    Today's meetings
                                </span>
                                <button
                                    onClick={syncEvents}
                                    disabled={eventsLoading}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                                    style={{ borderColor: t.border, color: GOLD }}
                                >
                                    {eventsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync
                                </button>
                            </div>
                            {eventsError && (
                                <div className="text-xs mb-2" style={{ color: WARN }}>
                                    {eventsError}
                                </div>
                            )}
                            {events === null && !eventsError && (
                                <div className="text-xs italic" style={{ color: t.faint }}>
                                    Not synced yet.
                                </div>
                            )}
                            {events && events.length === 0 && !eventsError && (
                                <div className="text-xs italic" style={{ color: t.faint }}>
                                    Nothing on the calendar today.
                                </div>
                            )}
                            <div className="space-y-1.5">
                                {(events || []).map((ev, i) => (
                                    <div key={i} className="text-sm flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: t.bg }}>
                                        <span style={{ color: t.text }}>{ev.title}</span>
                                        <span className="text-xs" style={{ color: t.muted }}>
                                            {ev.start}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="text-xs mt-3" style={{ color: t.faint }}>
                            Pulls from whoever's connectors are active when this is opened — each person sees their own Linear/Calendar.
                        </div>
                    </Card>

                    <Card eyebrow="Outreach" title="Email tracker">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium" style={{ color: t.text }}>
                                Sent today
                            </span>
                            <div className="flex items-center gap-1 text-xs" style={{ color: t.muted }}>
                                goal
                                <input
                                    type="number"
                                    value={emailGoal}
                                    onChange={(e) => updateEmailGoal(e.target.value)}
                                    className="w-12 rounded-md px-1.5 py-0.5 text-center text-xs"
                                    style={inputStyle()}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="text-3xl font-bold" style={{ color: ORANGE }}>
                                {todaySent}
                            </span>
                            <span className="text-sm" style={{ color: t.faint }}>
                                / {emailGoal}
                            </span>
                            <div className="flex gap-1.5 ml-auto">
                                <button onClick={() => adjustEmail('sent', -1)} className="w-7 h-7 rounded-full border text-sm" style={{ borderColor: t.border, color: t.muted }}>
                                    −
                                </button>
                                <button onClick={() => adjustEmail('sent', 1)} className="w-7 h-7 rounded-full border text-sm font-medium" style={{ borderColor: ORANGE, color: ORANGE }}>
                                    +1
                                </button>
                                <button onClick={() => adjustEmail('sent', 5)} className="px-2.5 h-7 rounded-full border text-xs font-medium" style={{ borderColor: ORANGE, color: ORANGE }}>
                                    +5
                                </button>
                            </div>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden mb-4" style={{ backgroundColor: t.border }}>
                            <div className="h-full rounded-full" style={{ width: `${emailGoalPct}%`, backgroundColor: ORANGE }} />
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {[
                                ['positive', 'Positive replies', '#5B8C5A'],
                                ['negative', 'Negative replies', WARN],
                                ['meetings', 'Meetings booked', GOLD]
                            ].map(([field, label, color]) => (
                                <div key={field} className="rounded-lg p-2 text-center" style={{ backgroundColor: t.bg }}>
                                    <div className="text-xs mb-1" style={{ color: t.muted }}>
                                        {label}
                                    </div>
                                    <div className="text-xl font-semibold mb-1.5" style={{ color }}>
                                        {todayEmailRecord ? todayEmailRecord[field] || 0 : 0}
                                    </div>
                                    <div className="flex justify-center gap-1.5">
                                        <button onClick={() => adjustEmail(field, -1)} className="w-6 h-6 rounded-full border text-xs" style={{ borderColor: t.border, color: t.muted }}>
                                            −
                                        </button>
                                        <button onClick={() => adjustEmail(field, 1)} className="w-6 h-6 rounded-full border text-xs" style={{ borderColor: color, color }}>
                                            +
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {emailChartData.length > 0 && (
                            <div style={{ height: 100 }} className="mb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={emailChartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} vertical={false} />
                                        <XAxis dataKey="date" stroke={t.faint} fontSize={11} tickLine={false} axisLine={false} />
                                        <YAxis hide />
                                        <Tooltip contentStyle={{ backgroundColor: t.surface, border: `1px solid ${t.border}`, fontSize: 12 }} labelStyle={{ color: t.text }} />
                                        <Bar dataKey="sent" fill={ORANGE} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: t.muted }}>
                            <div>
                                All-time sent: <span style={{ color: t.text }}>{totalSent}</span>
                            </div>
                            <div>
                                All-time meetings: <span style={{ color: t.text }}>{totalMeetings}</span>
                            </div>
                            <div>
                                Reply rate: <span style={{ color: t.text }}>{replyRate}%</span>
                            </div>
                            <div>
                                Positive rate: <span style={{ color: t.text }}>{positiveRate}%</span>
                            </div>
                        </div>
                    </Card>

                    <Card eyebrow="Money" title="Revenue tracker">
                        {chartData.length > 0 && (
                            <div style={{ height: 120 }} className="mb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} vertical={false} />
                                        <XAxis dataKey="date" stroke={t.faint} fontSize={11} tickLine={false} axisLine={false} />
                                        <YAxis hide />
                                        <Tooltip contentStyle={{ backgroundColor: t.surface, border: `1px solid ${t.border}`, fontSize: 12 }} labelStyle={{ color: t.text }} />
                                        <Bar dataKey="amount" fill={ORANGE} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <input type="date" value={revDraft.date} onChange={(e) => setRevDraft({ ...revDraft, date: e.target.value })} className="rounded-lg px-3 py-2 text-sm" style={inputStyle()} />
                            <input
                                type="number"
                                placeholder="Amount $"
                                value={revDraft.amount}
                                onChange={(e) => setRevDraft({ ...revDraft, amount: e.target.value })}
                                className="rounded-lg px-3 py-2 text-sm"
                                style={inputStyle()}
                            />
                            <input
                                placeholder="Source / client"
                                value={revDraft.source}
                                onChange={(e) => setRevDraft({ ...revDraft, source: e.target.value })}
                                className="rounded-lg px-3 py-2 text-sm col-span-2"
                                style={inputStyle()}
                            />
                        </div>
                        <button onClick={addRevenue} className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg font-medium mb-4" style={{ backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF' }}>
                            <Plus size={14} /> Log revenue
                        </button>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {[...revenue]
                                .sort((a, b) => (a.date < b.date ? 1 : -1))
                                .slice(0, 8)
                                .map((r) => (
                                    <div key={r.id} className="text-sm flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: t.bg }}>
                                        <span style={{ color: t.muted }}>{r.date}</span>
                                        <span className="flex-1 truncate" style={{ color: t.text }}>
                                            {r.source || '—'}
                                        </span>
                                        <span className="font-medium" style={{ color: ORANGE }}>
                                            ${Number(r.amount).toLocaleString('en-US')}
                                        </span>
                                        <button onClick={() => deleteRevenue(r.id)}>
                                            <Trash2 size={14} style={{ color: t.faint }} />
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </Card>

                    <Card eyebrow="Pipeline" title="Client &amp; prospect CRM">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <input placeholder="Name" value={crmDraft.name} onChange={(e) => setCrmDraft({ ...crmDraft, name: e.target.value })} className="rounded-lg px-3 py-2 text-sm" style={inputStyle()} />
                            <input
                                placeholder="Company"
                                value={crmDraft.company}
                                onChange={(e) => setCrmDraft({ ...crmDraft, company: e.target.value })}
                                className="rounded-lg px-3 py-2 text-sm"
                                style={inputStyle()}
                            />
                        </div>
                        <select
                            value={crmDraft.stage}
                            onChange={(e) => setCrmDraft({ ...crmDraft, stage: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-sm mb-2"
                            style={inputStyle()}
                        >
                            {STAGES.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                        <button onClick={addCrm} className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg font-medium mb-4" style={{ backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF' }}>
                            <Plus size={14} /> Add to pipeline
                        </button>
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {crm.map((c) => (
                                <div key={c.id} className="rounded-lg px-3 py-2" style={{ backgroundColor: t.bg }}>
                                    <div className="flex items-center justify-between mb-1 gap-2">
                                        <span className="text-sm font-medium truncate" style={{ color: t.text }}>
                                            {c.name}
                                            {c.company ? ` · ${c.company}` : ''}
                                        </span>
                                        <button onClick={() => deleteCrm(c.id)}>
                                            <Trash2 size={14} style={{ color: t.faint }} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <select
                                            value={c.stage}
                                            onChange={(e) => updateCrmStage(c.id, e.target.value)}
                                            className="text-xs rounded-full px-2 py-1"
                                            style={{ backgroundColor: t.surface, color: STAGE_COLORS[c.stage], border: `1px solid ${STAGE_COLORS[c.stage]}` }}
                                        >
                                            {STAGES.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="text-xs flex-shrink-0" style={{ color: t.faint }}>
                                            last touch {c.lastContact}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card eyebrow="Parking lot" title="Ideas &amp; opportunities">
                        <div className="text-xs mb-3" style={{ color: t.faint }}>
                            Anything that pulls focus goes here first — not into today's priorities.
                        </div>
                        <div className="flex gap-2 mb-4">
                            <input
                                value={ideaDraft}
                                onChange={(e) => setIdeaDraft(e.target.value)}
                                placeholder="New idea or opportunity..."
                                className="flex-1 rounded-lg px-3 py-2 text-sm"
                                style={inputStyle()}
                                onKeyDown={(e) => e.key === 'Enter' && addIdea()}
                            />
                            <button onClick={addIdea} className="px-3 py-2 rounded-lg" style={{ backgroundColor: ORANGE, color: theme === 'dark' ? '#15140F' : '#FFFFFF' }}>
                                <Plus size={16} />
                            </button>
                        </div>
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                            {ideas.map((idea) => (
                                <div key={idea.id} className="rounded-lg px-3 py-2" style={{ backgroundColor: t.bg, opacity: idea.status === 'discarded' ? 0.5 : 1 }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <span
                                            className="text-sm flex-1"
                                            style={{ color: t.text, textDecoration: idea.status === 'discarded' ? 'line-through' : 'none' }}
                                        >
                                            {idea.idea}
                                        </span>
                                        <button onClick={() => deleteIdea(idea.id)}>
                                            <Trash2 size={14} style={{ color: t.faint }} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span className="text-xs" style={{ color: t.faint }}>
                                            {idea.author} · {idea.date}
                                        </span>
                                        <div className="flex gap-1 ml-auto">
                                            {['parked', 'active', 'discarded'].map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => setIdeaStatus(idea.id, s)}
                                                    className="text-xs px-2 py-0.5 rounded-full"
                                                    style={idea.status === s ? { backgroundColor: t.orangeSoft, color: ORANGE } : { color: t.faint }}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card eyebrow="Reference" title="Document library">
                        <div className="text-xs mb-3" style={{ color: t.faint }}>
                            Paste your Drive folder links once — everyone sees the same source of truth.
                        </div>
                        <div className="space-y-2">
                            {[
                                ['northStar', 'Mission, brand & 30-day plan'],
                                ['icp', 'ICP documents'],
                                ['marketResearch', 'Market research'],
                                ['emailSequences', 'Email sequences'],
                                ['brainstorm', 'Founder brainstorm notes']
                            ].map(([key, label]) => (
                                <div key={key}>
                                    <span className="block text-xs mb-1" style={{ color: t.muted }}>
                                        {label}
                                    </span>
                                    <input
                                        value={docLinks[key] || ''}
                                        onChange={(e) => updateDocLink(key, e.target.value)}
                                        placeholder="Paste Drive link"
                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                        style={inputStyle()}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="mt-6 rounded-2xl p-5 sm:p-6 border transition-all duration-200" style={{ backgroundColor: t.surface, borderColor: t.border }}>
                    <div className="text-xs tracking-widest uppercase mb-3" style={{ color: ORANGE }}>
                        Last 7 days
                    </div>
                    {recentHistory.length === 0 && (
                        <div className="text-sm italic" style={{ color: t.faint }}>
                            Nothing logged yet — save today's log above to start the trail.
                        </div>
                    )}
                    <div className="space-y-3">
                        {recentHistory.map((d) => (
                            <div key={d.date} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 pb-3 border-b" style={{ borderColor: t.border }}>
                                <div className="text-xs w-28 flex-shrink-0" style={{ color: t.muted }}>
                                    {d.date} · {d.author}
                                </div>
                                <div className="flex-1 text-sm">
                                    {(d.priorities || []).map((p, i) => (
                                        <span
                                            key={i}
                                            className="mr-3"
                                            style={{ textDecoration: p.done ? 'line-through' : 'none', color: p.done ? t.faint : OWNER_COLORS[p.owner] || t.text }}
                                        >
                                            {p.text}
                                        </span>
                                    ))}
                                    {d.learning && (
                                        <div className="text-xs mt-1" style={{ color: GOLD }}>
                                            Learned: {d.learning}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
