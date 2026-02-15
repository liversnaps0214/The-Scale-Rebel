// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  view: 'login', // login, verifyOtp, clientList, clientDetail, newClient, inquiries
  loginEmail: '', // email entered during OTP login
  otpSending: false, // loading state for OTP send
  otpVerifying: false, // loading state for OTP verify
  currentClientId: null,
  clients: [],
  inquiries: [],
  searchQuery: '',
  message: null,
  messageType: null,
  loading: false,
  currentInquiryForClient: null, // inquiry being linked to a client
  currentInquiryForNewClient: null, // inquiry being used to create new client
  activeTab: 'clients', // clients, inquiries
};

// ============================================================================
// API WRAPPER
// ============================================================================

async function api(method, path, body = null) {
  const token = sessionStorage.getItem('admin_token');
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(path, options);

    if (response.status === 401) {
      sessionStorage.removeItem('admin_token');
      state.view = 'login';
      state.loginEmail = '';
      render();
      showMessage('Session expired. Please log in again.', 'error');
      return null;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json().catch(() => ({}));
  } catch (error) {
    showMessage(`API Error: ${error.message}`, 'error');
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showMessage(text, type = 'error') {
  state.message = text;
  state.messageType = type;
  render();
  setTimeout(() => {
    state.message = null;
    state.messageType = null;
    render();
  }, 5000);
}

function formatCurrency(value) {
  if (!value) return '$0';
  return `$${parseFloat(value).toLocaleString()}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusBadge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

function findClientById(id) {
  return state.clients.find(c => c.id == id);
}

function findInquiryById(id) {
  return state.inquiries.find(i => i.id == id);
}

// ============================================================================
// API CALLS
// ============================================================================

async function loadClients() {
  state.loading = true;
  const data = await api('GET', '/api/admin/clients');
  if (data && data.clients) {
    state.clients = data.clients;
  }
  state.loading = false;
}

async function loadClientDetail(id) {
  state.loading = true;
  const data = await api('GET', `/api/admin/clients?id=${id}`);
  if (data) {
    const client = data.client;
    const idx = state.clients.findIndex(c => c.id == id);
    if (idx >= 0) {
      state.clients[idx] = client;
    } else {
      state.clients.push(client);
    }
    state.currentClientId = id;
  }
  state.loading = false;
}

async function loadInquiries() {
  state.loading = true;
  const data = await api('GET', '/api/admin/inquiries');
  if (data && data.inquiries) {
    state.inquiries = data.inquiries.filter(i => !i.client_id);
  }
  state.loading = false;
}

async function saveClient(clientData) {
  state.loading = true;
  let data;

  if (clientData.id) {
    // Update existing
    data = await api('PUT', '/api/admin/clients', clientData);
  } else {
    // Create new
    data = await api('POST', '/api/admin/clients', clientData);
  }

  if (data && data.id) {
    showMessage('Client saved successfully', 'success');
    await loadClients();
    state.view = 'clientList';
    state.currentClientId = null;
  }
  state.loading = false;
}

async function deleteClient(id) {
  state.loading = true;
  const data = await api('DELETE', '/api/admin/clients', { id });
  if (data && data.success) {
    showMessage('Client deleted successfully', 'success');
    await loadClients();
    state.view = 'clientList';
    state.currentClientId = null;
  }
  state.loading = false;
}

async function linkInquiryToClient(inquiryId, clientId) {
  state.loading = true;
  const data = await api('POST', '/api/admin/inquiries/link', {
    inquiry_id: inquiryId,
    client_id: clientId,
  });

  if (data && data.success) {
    showMessage('Inquiry linked successfully', 'success');
    await loadInquiries();
    if (state.currentClientId) {
      await loadClientDetail(state.currentClientId);
    }
    state.currentInquiryForClient = null;
  }
  state.loading = false;
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function render() {
  const app = document.getElementById('app');

  // Check authentication
  const token = sessionStorage.getItem('admin_token');

  // Show OTP verification screen
  if (state.view === 'verifyOtp') {
    app.innerHTML = renderVerifyOtp();
    attachVerifyOtpListeners();
    return;
  }

  if (!token) {
    app.innerHTML = renderLogin();
    attachLoginListeners();
    return;
  }

  // Render main dashboard
  if (state.view === 'clientList') {
    app.innerHTML = renderClientList();
    attachClientListListeners();
  } else if (state.view === 'clientDetail') {
    app.innerHTML = renderClientDetail();
    attachClientDetailListeners();
  } else if (state.view === 'newClient') {
    app.innerHTML = renderNewClient();
    attachNewClientListeners();
  } else if (state.view === 'inquiries') {
    app.innerHTML = renderInquiries();
    attachInquiriesListeners();
  } else {
    app.innerHTML = renderClientList();
    attachClientListListeners();
  }
}

function renderLogin() {
  return `
    <div class="login-container">
      <div class="login-box">
        <h1>Admin Dashboard</h1>
        <p>Scale Rebel Studio CRM</p>
        ${renderMessage()}
        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email</label>
            <input
              type="email"
              id="login-email"
              name="email"
              required
              autofocus
              placeholder="Enter your admin email"
              value="${state.loginEmail}"
            >
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;" ${state.otpSending ? 'disabled' : ''}>
            ${state.otpSending ? 'Sending code...' : 'Send Login Code'}
          </button>
        </form>
      </div>
    </div>
  `;
}

function renderVerifyOtp() {
  return `
    <div class="login-container">
      <div class="login-box">
        <h1>Check Your Email</h1>
        <p>We sent a 6-digit code to <strong>${state.loginEmail}</strong></p>
        ${renderMessage()}
        <form id="verify-form">
          <div class="form-group">
            <label for="otp-code">Verification Code</label>
            <input
              type="text"
              id="otp-code"
              name="code"
              required
              autofocus
              placeholder="Enter 6-digit code"
              maxlength="6"
              pattern="[0-9]{6}"
              inputmode="numeric"
              autocomplete="one-time-code"
              style="text-align: center; font-size: 24px; letter-spacing: 8px; font-weight: 700;"
            >
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;" ${state.otpVerifying ? 'disabled' : ''}>
            ${state.otpVerifying ? 'Verifying...' : 'Verify & Sign In'}
          </button>
        </form>
        <div style="text-align: center; margin-top: 16px;">
          <button id="back-to-email" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 13px; font-family: inherit;">
            \u2190 Use a different email
          </button>
          <span style="color: var(--border); margin: 0 8px;">|</span>
          <button id="resend-code" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 13px; font-family: inherit;">
            Resend code
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderClientList() {
  const filteredClients = state.clients.filter(c => {
    const q = state.searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company && c.company.toLowerCase().includes(q))
    );
  });

  return `
    <div class="dashboard-header">
      <h1>Clients</h1>
      <button class="logout-btn" id="logout-btn">Logout</button>
    </div>
    <div class="dashboard-content">
      ${renderMessage()}
      <div class="tabs">
        <div class="tab ${state.activeTab === 'clients' ? 'active' : ''}" data-tab="clients">Clients</div>
        <div class="tab ${state.activeTab === 'inquiries' ? 'active' : ''}" data-tab="inquiries">Inquiries</div>
      </div>
      <div class="list-header">
        <input
          type="text"
          class="search-input"
          id="search-input"
          placeholder="Search by name or company..."
          value="${state.searchQuery}"
        >
        <button class="btn btn-primary" id="new-client-btn">+ New Client</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Status</th>
              <th>Budget</th>
              <th>Deadline</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody id="clients-tbody">
            ${
              filteredClients.length === 0
                ? '<tr><td colspan="6" style="text-align: center; padding: 40px;">No clients found</td></tr>'
                : filteredClients
                    .map(
                      client => `
              <tr class="client-row" data-id="${client.id}">
                <td>${client.name}</td>
                <td>${client.company || '—'}</td>
                <td>${getStatusBadge(client.status)}</td>
                <td>${formatCurrency(client.budget)}</td>
                <td>${formatDate(client.deadline)}</td>
                <td>${formatCurrency(client.cost)}</td>
              </tr>
            `
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderClientDetail() {
  const client = findClientById(state.currentClientId);
  if (!client) {
    return `
      <div class="dashboard-header">
        <h1>Client Detail</h1>
        <button class="logout-btn" id="logout-btn">Logout</button>
      </div>
      <div class="dashboard-content">
        <p style="text-align: center; padding: 40px;">Client not found</p>
      </div>
    `;
  }

  const linkedInquiries = client.inquiries || [];

  return `
    <div class="dashboard-header">
      <h1>Client Detail</h1>
      <button class="logout-btn" id="logout-btn">Logout</button>
    </div>
    <div class="dashboard-content">
      ${renderMessage()}
      <div class="detail-header">
        <h2>${client.name}</h2>
        <div class="detail-actions">
          <button class="btn btn-secondary btn-small" id="back-btn">\u2190 Back to List</button>
          <button class="btn btn-danger btn-small" id="delete-btn">Delete</button>
        </div>
      </div>

      <form id="detail-form" class="form">
        <div class="form-section">
          <h3>Basic Information</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="detail-name">Name</label>
              <input type="text" id="detail-name" value="${client.name}" required>
            </div>
            <div class="form-group">
              <label for="detail-email">Email</label>
              <input type="email" id="detail-email" value="${client.email || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="detail-phone">Phone</label>
              <input type="text" id="detail-phone" value="${client.phone || ''}">
            </div>
            <div class="form-group">
              <label for="detail-company">Company</label>
              <input type="text" id="detail-company" value="${client.company || ''}">
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Project Details</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="detail-status">Status</label>
              <select id="detail-status">
                <option value="lead" ${client.status === 'lead' ? 'selected' : ''}>Lead</option>
                <option value="active" ${client.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${client.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="archived" ${client.status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>
            <div class="form-group">
              <label for="detail-deadline">Deadline</label>
              <input type="date" id="detail-deadline" value="${client.deadline || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="detail-budget">Budget</label>
              <input type="number" id="detail-budget" value="${client.budget || ''}" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label for="detail-cost">Cost</label>
              <input type="number" id="detail-cost" value="${client.cost || ''}" min="0" step="0.01">
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-group form-row full">
            <label for="detail-notes">Notes</label>
            <textarea id="detail-notes" placeholder="Add notes about this client...">${client.notes || ''}</textarea>
          </div>
        </div>

        <button type="submit" class="btn btn-primary">Save Changes</button>
      </form>

      ${
        linkedInquiries.length > 0
          ? `
        <div class="inquiries-section">
          <h3>Linked Inquiries</h3>
          ${linkedInquiries
            .map(
              inquiry => `
            <div class="inquiry-item">
              <div class="inquiry-header">
                <span class="inquiry-name">${inquiry.name}</span>
              </div>
              <div class="inquiry-meta">
                ${inquiry.email} \u2022 ${inquiry.company || 'Unknown'} \u2022 ${formatDate(inquiry.created_at)}
              </div>
              <div class="inquiry-message">"${inquiry.message.substring(0, 150)}${inquiry.message.length > 150 ? '...' : ''}"</div>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderNewClient() {
  const inquiry = state.currentInquiryForNewClient ? findInquiryById(state.currentInquiryForNewClient) : null;

  return `
    <div class="dashboard-header">
      <h1>New Client</h1>
      <button class="logout-btn" id="logout-btn">Logout</button>
    </div>
    <div class="dashboard-content">
      ${renderMessage()}
      <button class="btn btn-secondary btn-small" id="back-btn" style="margin-bottom: 24px;">\u2190 Back to List</button>

      <form id="new-client-form" class="form">
        <div class="form-section">
          <h3>Basic Information</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="new-name">Name</label>
              <input type="text" id="new-name" value="${inquiry?.name || ''}" required>
            </div>
            <div class="form-group">
              <label for="new-email">Email</label>
              <input type="email" id="new-email" value="${inquiry?.email || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="new-phone">Phone</label>
              <input type="text" id="new-phone" value="">
            </div>
            <div class="form-group">
              <label for="new-company">Company</label>
              <input type="text" id="new-company" value="${inquiry?.company || ''}">
            </div>
          </div>
        </div>

        <div class="form-section">
          <h3>Project Details</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="new-status">Status</label>
              <select id="new-status">
                <option value="lead" selected>Lead</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="form-group">
              <label for="new-deadline">Deadline</label>
              <input type="date" id="new-deadline" value="">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="new-budget">Budget</label>
              <input type="number" id="new-budget" value="" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label for="new-cost">Cost</label>
              <input type="number" id="new-cost" value="" min="0" step="0.01">
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-group form-row full">
            <label for="new-notes">Notes</label>
            <textarea id="new-notes" placeholder="Add notes about this client...">${inquiry?.message || ''}</textarea>
          </div>
        </div>

        <button type="submit" class="btn btn-primary">Create Client</button>
      </form>
    </div>
  `;
}

function renderInquiries() {
  const unlinkedInquiries = state.inquiries.filter(i => !i.client_id);

  return `
    <div class="dashboard-header">
      <h1>Inquiries</h1>
      <button class="logout-btn" id="logout-btn">Logout</button>
    </div>
    <div class="dashboard-content">
      ${renderMessage()}
      <div class="tabs">
        <div class="tab ${state.activeTab === 'clients' ? 'active' : ''}" data-tab="clients">Clients</div>
        <div class="tab ${state.activeTab === 'inquiries' ? 'active' : ''}" data-tab="inquiries">Inquiries</div>
      </div>

      ${
        unlinkedInquiries.length === 0
          ? '<div class="empty-state"><p>All inquiries have been linked to clients</p></div>'
          : `
        <div>
          ${unlinkedInquiries
            .map(
              inquiry => `
            <div class="inquiry-item">
              <div class="inquiry-header">
                <span class="inquiry-name">${inquiry.name}</span>
              </div>
              <div class="inquiry-meta">
                ${inquiry.email} \u2022 ${inquiry.company || 'Unknown'} \u2022 ${formatDate(inquiry.created_at)}
              </div>
              <div class="inquiry-message">"${inquiry.message.substring(0, 200)}${inquiry.message.length > 200 ? '...' : ''}"</div>
              <div class="inquiry-actions">
                <button class="btn btn-primary btn-small create-from-inquiry" data-id="${inquiry.id}">
                  + Create Client
                </button>
                <button class="btn btn-secondary btn-small link-inquiry" data-id="${inquiry.id}">
                  Link to Existing
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    </div>
    ${renderLinkInquiryModal()}
  `;
}

function renderLinkInquiryModal() {
  if (!state.currentInquiryForClient) return '';

  const clientOptions = state.clients
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  return `
    <div class="modal" id="link-modal">
      <div class="modal-content">
        <h2>Link to Existing Client</h2>
        <div class="form-group">
          <label for="link-select">Select Client</label>
          <select id="link-select">
            <option value="">Choose a client...</option>
            ${clientOptions}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="link-cancel-btn">Cancel</button>
          <button class="btn btn-primary" id="link-confirm-btn">Link</button>
        </div>
      </div>
    </div>
  `;
}

function renderMessage() {
  if (!state.message) return '';
  return `<div class="message message-${state.messageType}">${state.message}</div>`;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function attachLoginListeners() {
  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      if (!email) return;

      state.loginEmail = email;
      state.otpSending = true;
      render();

      try {
        const response = await fetch('/api/admin/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.sent) {
          state.otpSending = false;
          state.view = 'verifyOtp';
          render();
        } else {
          state.otpSending = false;
          showMessage(data.error || 'Failed to send code. Try again.', 'error');
        }
      } catch (error) {
        state.otpSending = false;
        showMessage('Network error. Check your connection.', 'error');
      }
    });
  }
}

function attachVerifyOtpListeners() {
  const form = document.getElementById('verify-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const code = document.getElementById('otp-code').value.trim();
      if (!code) return;

      state.otpVerifying = true;
      render();

      try {
        const response = await fetch('/api/admin/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: state.loginEmail, code }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.token) {
          sessionStorage.setItem('admin_token', data.token);
          state.otpVerifying = false;
          state.view = 'clientList';
          state.loginEmail = '';
          await loadClients();
          render();
        } else {
          state.otpVerifying = false;
          showMessage(data.error || 'Invalid code. Try again.', 'error');
        }
      } catch (error) {
        state.otpVerifying = false;
        showMessage('Network error. Check your connection.', 'error');
      }
    });
  }

  // Back to email
  const backBtn = document.getElementById('back-to-email');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.view = 'login';
      render();
    });
  }

  // Resend code
  const resendBtn = document.getElementById('resend-code');
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/admin/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: state.loginEmail }),
        });

        if (response.ok) {
          showMessage('New code sent. Check your email.', 'success');
        } else {
          const data = await response.json().catch(() => ({}));
          showMessage(data.error || 'Failed to resend. Try again.', 'error');
        }
      } catch (error) {
        showMessage('Network error. Check your connection.', 'error');
      }
    });
  }
}

function attachClientListListeners() {
  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      render();
    });
  }

  // New client
  const newClientBtn = document.getElementById('new-client-btn');
  if (newClientBtn) {
    newClientBtn.addEventListener('click', () => {
      state.view = 'newClient';
      state.currentInquiryForNewClient = null;
      render();
    });
  }

  // Row clicks
  const rows = document.querySelectorAll('.client-row');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      state.currentClientId = id;
      state.view = 'clientDetail';
      loadClientDetail(id);
      render();
    });
  });

  // Tabs
  attachTabListeners();

  // Logout
  attachLogoutListener();
}

function attachClientDetailListeners() {
  // Back button
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.view = 'clientList';
      state.currentClientId = null;
      render();
    });
  }

  // Delete button
  const deleteBtn = document.getElementById('delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this client? This action cannot be undone.')) {
        deleteClient(state.currentClientId);
        render();
      }
    });
  }

  // Form submit
  const form = document.getElementById('detail-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const clientData = {
        id: state.currentClientId,
        name: document.getElementById('detail-name').value,
        email: document.getElementById('detail-email').value,
        phone: document.getElementById('detail-phone').value,
        company: document.getElementById('detail-company').value,
        status: document.getElementById('detail-status').value,
        budget: parseFloat(document.getElementById('detail-budget').value) || null,
        cost: parseFloat(document.getElementById('detail-cost').value) || null,
        deadline: document.getElementById('detail-deadline').value || null,
        notes: document.getElementById('detail-notes').value,
      };
      await saveClient(clientData);
      render();
    });
  }

  // Tabs
  attachTabListeners();

  // Logout
  attachLogoutListener();
}

function attachNewClientListeners() {
  // Back button
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.view = 'clientList';
      state.currentInquiryForNewClient = null;
      render();
    });
  }

  // Form submit
  const form = document.getElementById('new-client-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const clientData = {
        name: document.getElementById('new-name').value,
        email: document.getElementById('new-email').value,
        phone: document.getElementById('new-phone').value,
        company: document.getElementById('new-company').value,
        status: document.getElementById('new-status').value,
        budget: parseFloat(document.getElementById('new-budget').value) || null,
        cost: parseFloat(document.getElementById('new-cost').value) || null,
        deadline: document.getElementById('new-deadline').value || null,
        notes: document.getElementById('new-notes').value,
      };
      await saveClient(clientData);
      render();
    });
  }

  // Logout
  attachLogoutListener();
}

function attachInquiriesListeners() {
  // Create from inquiry
  const createBtns = document.querySelectorAll('.create-from-inquiry');
  createBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const inquiryId = btn.dataset.id;
      state.currentInquiryForNewClient = inquiryId;
      state.view = 'newClient';
      render();
    });
  });

  // Link inquiry
  const linkBtns = document.querySelectorAll('.link-inquiry');
  linkBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const inquiryId = btn.dataset.id;
      state.currentInquiryForClient = inquiryId;
      render();

      // Attach modal listeners
      setTimeout(() => {
        attachLinkModalListeners();
      }, 0);
    });
  });

  // Tabs
  attachTabListeners();

  // Logout
  attachLogoutListener();
}

function attachLinkModalListeners() {
  const modal = document.getElementById('link-modal');
  if (!modal) return;

  const cancelBtn = document.getElementById('link-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.currentInquiryForClient = null;
      render();
    });
  }

  const confirmBtn = document.getElementById('link-confirm-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const select = document.getElementById('link-select');
      const clientId = select.value;
      if (!clientId) {
        showMessage('Please select a client', 'error');
        return;
      }
      await linkInquiryToClient(state.currentInquiryForClient, clientId);
      render();
    });
  }

  // Close on background click
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      state.currentInquiryForClient = null;
      render();
    }
  });
}

function attachTabListeners() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      state.activeTab = tabName;

      if (tabName === 'clients') {
        state.view = 'clientList';
      } else if (tabName === 'inquiries') {
        state.view = 'inquiries';
        loadInquiries();
      }

      render();
    });
  });
}

function attachLogoutListener() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      // Invalidate session on server
      const token = sessionStorage.getItem('admin_token');
      if (token) {
        fetch('/api/admin/otp/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {}); // Fire and forget
      }
      sessionStorage.removeItem('admin_token');
      state.view = 'login';
      state.loginEmail = '';
      state.currentClientId = null;
      state.searchQuery = '';
      render();
    });
  }
}

// ============================================================================
// INITIAL RENDER
// ============================================================================

render();
