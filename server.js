const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { 
  ssoGuardMiddleware, 
  createSessionToken, 
  SSO_COOKIE_NAME,
  LEGACY_COOKIE_NAME 
} = require('./sso-guard');

const { 
  getAgentsTelemetry, 
  getKanbanTelemetry, 
  getCronTelemetry 
} = require('./telemetry-service');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Public health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Hermes 3D Spatial Digital Twin Studio',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Local login fallback
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if ((email === 'fauziramdani0112@gmail.com' || email === 'admin') && password) {
    const userPayload = {
      userId: 1,
      email: 'fauziramdani0112@gmail.com',
      name: 'Fauzi Ramdani',
      role: 'SUPERADMIN'
    };
    const token = createSessionToken(userPayload);
    const cookieOptions = {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    };
    res.cookie(SSO_COOKIE_NAME, token, cookieOptions);
    res.cookie(LEGACY_COOKIE_NAME, token, cookieOptions);
    return res.json({ success: true, user: userPayload });
  }
  return res.status(401).json({ success: false, error: 'Email atau password salah' });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SSO_COOKIE_NAME, { path: '/' });
  res.clearCookie(LEGACY_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

// Serve vendor assets publicly so module scripts load seamlessly
app.use('/vendor', express.static(path.join(__dirname, 'public/vendor')));

// Protect all remaining routes with SSO guard
app.use(ssoGuardMiddleware);

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// 1. GET /api/telemetry - Unified real-time multi-agent fleet telemetry
app.get('/api/telemetry', (req, res) => {
  try {
    const data = getAgentsTelemetry();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET /api/kanban - Sprint tasks and status from SQLite
app.get('/api/kanban', (req, res) => {
  try {
    const data = getKanbanTelemetry();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET /api/cron - Background scheduler telemetry & execution logs
app.get('/api/cron', (req, res) => {
  try {
    const data = getCronTelemetry();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET /api/agents - Backward compatibility alias
app.get('/api/agents', (req, res) => {
  try {
    const data = getAgentsTelemetry();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. POST /api/chat - Direct Hermes Chat with profile
function runHermesCommand(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('hermes', args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Timeout hermes (${timeoutMs}ms)`));
    }, timeoutMs);

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Exit code ${code}`));
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

app.post('/api/chat', async (req, res) => {
  const { profile, message } = req.body;
  if (!profile || !message) {
    return res.status(400).json({ success: false, error: 'Profile and message required' });
  }

  try {
    const args = ['chat', '-q', message];
    if (profile !== 'default') {
      args.unshift('--profile', profile);
    }
    const reply = await runHermesCommand(args);
    res.json({
      success: true,
      agentId: profile,
      reply,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SPA catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Hermes 3D HQ] Running on http://0.0.0.0:${PORT}`);
});
