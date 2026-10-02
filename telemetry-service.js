const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const HERMES_ROOT = '/home/yes/.hermes';
const KANBAN_DB_PATH = path.join(HERMES_ROOT, 'kanban/boards/ai-studio/kanban.db');
const CRON_DIR = path.join(HERMES_ROOT, 'cron');

const AGENTS_METADATA = [
  {
    id: 'default',
    profile: 'default',
    name: 'Kagura',
    role: 'Lead Fullstack Architect & BA',
    telegram: '@my_kagura_bot',
    color: '#6366f1',
    accentColor: '#4f46e5',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    avatar: { hair: '#3b82f6', shirt: '#1e293b', accent: '#6366f1', skin: '#fbd38d' },
    workDesk: { x: 180, y: 320, label: 'Workstation Kagura (Architect)' },
    idleSpot: { x: 740, y: 490, label: 'Espresso Bar', activity: 'Minum Kopi & Membaca Spek' },
    description: 'Memimpin perencanaan arsitektur, spesifikasi bisnis, dan orkestrasi tim multi-agent.'
  },
  {
    id: 'agent-d',
    profile: 'agent-d',
    name: 'Agent D',
    role: 'Senior Frontend & UI Specialist',
    telegram: '@vorazi4_bot',
    color: '#06b6d4',
    accentColor: '#0891b2',
    badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    avatar: { hair: '#0284c7', shirt: '#0f172a', accent: '#06b6d4', skin: '#fed7aa' },
    workDesk: { x: 300, y: 320, label: 'Workstation Dev 2 (Frontend)' },
    idleSpot: { x: 840, y: 490, label: 'Arcade Gaming Machine', activity: 'Bermain Retro Arcade' },
    description: 'Membangun antarmuka Next.js/React modern, interaktivitas client, dan mobile responsiveness.'
  },
  {
    id: 'agent-a',
    profile: 'agent-a',
    name: 'Agent A',
    role: 'Lead QA & Security Auditor',
    telegram: '@vorazi1_bot',
    color: '#10b981',
    accentColor: '#059669',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    avatar: { hair: '#059669', shirt: '#134e4a', accent: '#10b981', skin: '#fde047' },
    workDesk: { x: 420, y: 320, label: 'Workstation QA & Security' },
    idleSpot: { x: 920, y: 530, label: 'Gym Dumbbell Area', activity: 'Olahraga Pushup & Dumbbell' },
    description: 'Menjalankan audit testing otomatis, verifikasi keamanan, dan mencegah regresi sistem.'
  },
  {
    id: 'agent-b',
    profile: 'agent-b',
    name: 'Agent B',
    role: 'Lead UI/UX Evaluator',
    telegram: '@vorazi2_bot',
    color: '#f59e0b',
    accentColor: '#d97706',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    avatar: { hair: '#d97706', shirt: '#451a03', accent: '#f59e0b', skin: '#fed7aa' },
    workDesk: { x: 240, y: 420, label: 'Workstation UI/UX Evaluator' },
    idleSpot: { x: 780, y: 380, label: 'Sofa Santai Lounge', activity: 'Santai di Sofa & Membaca Design System' },
    description: 'Memastikan standar UI/UX bebas AI-slop, clean Linear/Vercel slate, dan ergonomi mobile.'
  },
  {
    id: 'agent-c',
    profile: 'agent-c',
    name: 'Agent C',
    role: 'Lead AI Architect & Prompt Engineer',
    telegram: '@vorazi3_bot',
    color: '#ec4899',
    accentColor: '#db2777',
    badgeClass: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    avatar: { hair: '#db2777', shirt: '#500724', accent: '#ec4899', skin: '#fbd38d' },
    workDesk: { x: 360, y: 420, label: 'Workstation AI Engine' },
    idleSpot: { x: 880, y: 380, label: 'Beanbag Rehat', activity: 'Rehat Santai Mendengarkan Musik' },
    description: 'Merancang prompt berantai, tuning model, dan menjaga konsistensi respon LLM.'
  }
];

// Helper to safely execute a query on an SQLite file
function queryDb(dbPath, sql, params = [], readOnly = true) {
  let db = null;
  try {
    if (!fs.existsSync(dbPath)) return [];
    db = new Database(dbPath, { readonly: readOnly, fileMustExist: true, timeout: 2000 });
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows;
  } catch (err) {
    return [];
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
}

// 1. Get Live Kanban Telemetry
function getKanbanTelemetry() {
  try {
    const tasks = queryDb(KANBAN_DB_PATH, `
      SELECT id, title, body, assignee, status, priority, created_at, started_at, completed_at, worker_pid 
      FROM tasks 
      ORDER BY created_at DESC
    `);

    const summary = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'todo').length,
      ready: tasks.filter(t => t.status === 'ready').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      review: tasks.filter(t => t.status === 'review').length,
      done: tasks.filter(t => t.status === 'done').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
    };

    return {
      activeBoard: 'ai-studio',
      boardPath: KANBAN_DB_PATH,
      summary,
      recentTasks: tasks.slice(0, 15)
    };
  } catch (err) {
    return {
      activeBoard: 'default',
      summary: { total: 0, todo: 0, ready: 0, in_progress: 0, review: 0, done: 0, blocked: 0 },
      recentTasks: []
    };
  }
}

// 2. Get Live Cron Telemetry
function getCronTelemetry() {
  try {
    const heartbeatPath = path.join(CRON_DIR, 'ticker_heartbeat');
    let isRunning = false;
    let lastHeartbeatAgoSec = null;

    if (fs.existsSync(heartbeatPath)) {
      const stats = fs.statSync(heartbeatPath);
      const diffSec = Math.floor((Date.now() - stats.mtimeMs) / 1000);
      lastHeartbeatAgoSec = diffSec;
      isRunning = diffSec < 180; // ticker ticks every 60s
    }

    // Read executions if executions.db exists
    const execDbPath = path.join(CRON_DIR, 'executions.db');
    let recentExecutions = [];
    if (fs.existsSync(execDbPath)) {
      recentExecutions = queryDb(execDbPath, `
        SELECT job_id, scheduled_instant, status, started_at, finished_at, error
        FROM executions 
        ORDER BY started_at DESC 
        LIMIT 6
      `);
    }

    return {
      schedulerStatus: isRunning ? 'RUNNING' : 'IDLE',
      lastHeartbeatAgoSec,
      recentExecutions,
      cronDir: CRON_DIR
    };
  } catch (err) {
    return {
      schedulerStatus: 'UNKNOWN',
      lastHeartbeatAgoSec: null,
      recentExecutions: []
    };
  }
}

// 3. Get Full Multi-Agent Real-time Status
function getAgentsTelemetry() {
  const kanban = getKanbanTelemetry();
  const now = Date.now() / 1000;

  const agents = AGENTS_METADATA.map(meta => {
    const dbPath = meta.profile === 'default'
      ? path.join(HERMES_ROOT, 'state.db')
      : path.join(HERMES_ROOT, 'profiles', meta.profile, 'state.db');

    // A. Check active turn leases (100% deterministic signal of LLM / tool execution)
    const leases = queryDb(dbPath, `
      SELECT conversation_id, holder, acquired_at, expires_at 
      FROM session_turn_leases
      WHERE expires_at > ?
    `, [now]);

    // B. Check latest session activity
    const recentSessions = queryDb(dbPath, `
      SELECT id, title, last_activity_at, last_activity_description, message_count, tool_call_count, tool_names, model
      FROM sessions 
      ORDER BY last_activity_at DESC 
      LIMIT 1
    `);
    const latestSession = recentSessions[0] || null;

    // C. Check active kanban task
    const assignedTasks = kanban.recentTasks.filter(t => 
      t.assignee === meta.profile || 
      (meta.profile === 'default' && (t.assignee === 'default' || !t.assignee))
    );
    const inProgressTask = assignedTasks.find(t => t.status === 'in_progress');
    const reviewTask = assignedTasks.find(t => t.status === 'review');
    const activeTask = inProgressTask || reviewTask || null;

    // D. Formulate real working state
    const hasActiveLease = leases.length > 0;
    const isWorking = hasActiveLease || (activeTask !== null);

    let state = 'IDLE';
    let targetZone = 'LOUNGE';
    let activityText = meta.idleSpot.activity;
    let targetCoords = meta.idleSpot;

    if (isWorking) {
      state = 'WORKING';
      targetZone = 'WORKSTATION';
      targetCoords = meta.workDesk;

      if (hasActiveLease) {
        activityText = latestSession?.last_activity_description || 'Eksekusi Prompt & Tools';
      } else if (activeTask) {
        activityText = `Mengerjakan: ${activeTask.title}`;
      }
    }

    return {
      ...meta,
      state, // 'WORKING' | 'IDLE'
      targetZone, // 'WORKSTATION' | 'LOUNGE'
      activityText,
      targetCoords,
      activeLeasesCount: leases.length,
      desk: meta.workDesk, // backward compatibility with canvas renderer
      worldState: { state: state === 'WORKING' ? 'AT_DESK' : 'LOUNGE' }, // backward compatibility
      currentTask: activeTask ? {
        id: activeTask.id,
        title: activeTask.title,
        status: activeTask.status,
        priority: activeTask.priority
      } : null,
      latestSession: latestSession ? {
        id: latestSession.id,
        title: latestSession.title,
        model: latestSession.model,
        toolCount: latestSession.tool_call_count,
        messageCount: latestSession.message_count,
        lastActivityAt: latestSession.last_activity_at
      } : null
    };
  });

  const workingCount = agents.filter(a => a.state === 'WORKING').length;
  const idleCount = agents.filter(a => a.state === 'IDLE').length;

  return {
    timestamp: new Date().toISOString(),
    currentActivity: workingCount > 0 ? 'NORMAL_WORK' : 'COFFEE_BREAK',
    summary: {
      totalAgents: agents.length,
      workingCount,
      idleCount
    },
    agents,
    kanban: kanban.summary,
    cron: getCronTelemetry()
  };
}

module.exports = {
  getAgentsTelemetry,
  getKanbanTelemetry,
  getCronTelemetry,
  AGENTS_METADATA
};
