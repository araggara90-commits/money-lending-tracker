const STORAGE_KEY = 'mvr-ledger-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const sampleState = {
  settings: {
    currency: 'MVR',
    appName: 'MVR Ledger',
    reminderDays: 3,
    notificationsEnabled: true,
    defaultMessage: 'Hello [Name], this is a friendly reminder that your repayment of MVR [Amount] is due on [Date] at [Time]. Please let me know when you expect to make the payment. Thank you.'
  },
  people: [
    { id: 'p1', name: 'Aisha Ibrahim', phone: '+9609123456', address: 'Male', notes: 'Friend from work', createdAt: '2025-05-22', archived: false },
    { id: 'p2', name: 'Hussain Ali', phone: '+9609900111', address: 'Hulhumale', notes: 'Family friend', createdAt: '2025-06-05', archived: false },
    { id: 'p3', name: 'Naseema', phone: '+9607778888', address: 'Addu', notes: 'Business partner', createdAt: '2025-07-11', archived: false }
  ],
  records: [
    {
      id: 'r1',
      personId: 'p1',
      type: 'lend',
      principal: 5000,
      interest: 0,
      fees: 0,
      paymentMethod: 'Bank transfer',
      description: 'Emergency support',
      notes: 'Friendly loan',
      schedule: 'One-time',
      date: '2025-10-01',
      dueDate: '2025-10-20',
      dueTime: '18:00',
      createdAt: '2025-10-01T12:00:00.000Z',
      updatedAt: '2025-10-01T12:00:00.000Z',
      cancelled: false,
      status: 'Active'
    },
    {
      id: 'r2',
      personId: 'p2',
      type: 'borrow',
      principal: 2500,
      interest: 0,
      fees: 0,
      paymentMethod: 'Cash',
      description: 'School fee',
      notes: 'Need repayment by weekend',
      schedule: 'One-time',
      date: '2025-10-08',
      dueDate: '2025-10-18',
      dueTime: '15:30',
      createdAt: '2025-10-08T09:00:00.000Z',
      updatedAt: '2025-10-08T09:00:00.000Z',
      cancelled: false,
      status: 'Active'
    }
  ],
  repayments: [
    { id: 'rp1', recordId: 'r1', personId: 'p1', amount: 2000, allocation: 'principal', date: '2025-10-12', time: '09:15', method: 'Bank transfer', note: 'Partial payment', createdAt: '2025-10-12T09:15:00.000Z' },
    { id: 'rp2', recordId: 'r2', personId: 'p2', amount: 1300, allocation: 'principal', date: '2025-10-15', time: '17:20', method: 'Cash', note: 'Repayment sent', createdAt: '2025-10-15T17:20:00.000Z' }
  ],
  notifications: []
};

const currencyFormatter = (value, currency = 'MVR') => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return new Intl.NumberFormat('en-MV', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeValue);
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const getPastMonths = (count = 6) => {
  const months = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const month = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(month);
  }
  return months;
};

const safeNumber = (value) => Number(value || 0);

const getPersonName = (people, personId) => {
  const person = people.find((entry) => entry.id === personId);
  return person ? person.name : 'Unknown person';
};

const getRecordMetrics = (record, repayments) => {
  const relatedRepayments = repayments.filter((entry) => entry.recordId === record.id);
  const principalPaid = relatedRepayments
    .filter((entry) => entry.allocation === 'principal')
    .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

  const interestPaid = relatedRepayments
    .filter((entry) => entry.allocation === 'interest')
    .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

  const feesPaid = relatedRepayments
    .filter((entry) => entry.allocation === 'fees')
    .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

  const outstandingPrincipal = Math.max(0, safeNumber(record.principal) - principalPaid);
  const outstandingInterest = Math.max(0, safeNumber(record.interest) - interestPaid);
  const outstandingFees = Math.max(0, safeNumber(record.fees) - feesPaid);
  const totalOutstanding = outstandingPrincipal + outstandingInterest + outstandingFees;
  const totalPaid = principalPaid + interestPaid + feesPaid;

  const dueDate = record.dueDate ? new Date(`${record.dueDate}T${record.dueTime || '00:00'}:00`) : null;
  const now = new Date();
  const overdue = dueDate && totalOutstanding > 0 && dueDate < now;
  const paid = totalOutstanding <= 0;

  let status = 'Upcoming';
  if (record.cancelled) status = 'Cancelled';
  else if (paid) status = 'Paid';
  else if (overdue) status = 'Overdue';
  else if (totalPaid > 0) status = 'Partially Paid';
  else if (dueDate && dueDate.getTime() <= now.getTime() + 7 * DAY_MS) status = 'Active';

  return {
    principalPaid,
    interestPaid,
    feesPaid,
    totalPaid,
    outstandingPrincipal,
    outstandingInterest,
    outstandingFees,
    totalOutstanding,
    overdue,
    paid,
    dueDate,
    status
  };
};

const buildReminderNotifications = (records, repayments, settings) => {
  const now = new Date();
  const results = [];
  const reminderDays = Number(settings.reminderDays || 3);

  records.forEach((record) => {
    if (record.cancelled) return;
    const metrics = getRecordMetrics(record, repayments);
    if (metrics.paid) {
      results.push({
        id: `${record.id}-paid`,
        type: 'final-payment',
        read: false,
        title: 'Balance cleared',
        message: `${getPersonName(record.people || [], record.personId)} has fully repaid ${currencyFormatter(metrics.totalPaid, settings.currency)}.`,
        recordId: record.id,
        createdAt: new Date().toISOString(),
        link: `/records/${record.id}`
      });
      return;
    }

    const dueDate = record.dueDate ? new Date(`${record.dueDate}T${record.dueTime || '00:00'}:00`) : null;
    if (!dueDate) return;

    const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS);
    if (diffDays === 0) {
      results.push({
        id: `${record.id}-due-today`,
        type: 'due-today',
        read: false,
        title: 'Payment due today',
        message: `${getPersonName([], record.personId)} has a payment of ${currencyFormatter(metrics.totalOutstanding, settings.currency)} due today.`,
        recordId: record.id,
        createdAt: new Date().toISOString(),
        link: `/records/${record.id}`
      });
    }

    if (diffDays > 0 && diffDays <= reminderDays) {
      results.push({
        id: `${record.id}-upcoming`,
        type: 'upcoming',
        read: false,
        title: 'Upcoming repayment',
        message: `${getPersonName([], record.personId)} has an upcoming repayment of ${currencyFormatter(metrics.totalOutstanding, settings.currency)} in ${diffDays} day(s).`,
        recordId: record.id,
        createdAt: new Date().toISOString(),
        link: `/records/${record.id}`
      });
    }

    if (diffDays < 0 && metrics.totalOutstanding > 0) {
      results.push({
        id: `${record.id}-overdue`,
        type: 'overdue',
        read: false,
        title: 'Overdue payment',
        message: `${getPersonName([], record.personId)} has an overdue balance of ${currencyFormatter(metrics.totalOutstanding, settings.currency)}.`,
        recordId: record.id,
        createdAt: new Date().toISOString(),
        link: `/records/${record.id}`
      });
    }

    if (metrics.totalPaid > 0 && metrics.totalOutstanding > 0) {
      results.push({
        id: `${record.id}-partial`,
        type: 'partial-payment',
        read: false,
        title: 'Partial payment received',
        message: `${getPersonName([], record.personId)} has made a partial payment. Remaining balance: ${currencyFormatter(metrics.totalOutstanding, settings.currency)}.`,
        recordId: record.id,
        createdAt: new Date().toISOString(),
        link: `/records/${record.id}`
      });
    }
  });

  return results;
};

const getInitialState = () => {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error('Unable to parse stored state', error);
    }
  }
  return sampleState;
};

const computeDashboard = (people, records, repayments, settings) => {
  const enrichedRecords = records.map((record) => ({
    ...record,
    ...getRecordMetrics(record, repayments),
    personName: getPersonName(people, record.personId)
  }));

  const totalLent = enrichedRecords
    .filter((record) => record.type === 'lend')
    .reduce((sum, record) => sum + safeNumber(record.principal), 0);

  const totalBorrowed = enrichedRecords
    .filter((record) => record.type === 'borrow')
    .reduce((sum, record) => sum + safeNumber(record.principal), 0);

  const totalReceived = repayments
    .filter((entry) => {
      const record = enrichedRecords.find((item) => item.id === entry.recordId);
      return record && record.type === 'lend';
    })
    .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

  const totalRepaid = repayments
    .filter((entry) => {
      const record = enrichedRecords.find((item) => item.id === entry.recordId);
      return record && record.type === 'borrow';
    })
    .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

  const amountOwedToMe = enrichedRecords
    .filter((record) => record.type === 'lend')
    .reduce((sum, record) => sum + safeNumber(record.totalOutstanding), 0);

  const amountIOwe = enrichedRecords
    .filter((record) => record.type === 'borrow')
    .reduce((sum, record) => sum + safeNumber(record.totalOutstanding), 0);

  const dueToday = enrichedRecords.filter((record) => {
    if (record.cancelled || record.totalOutstanding <= 0) return false;
    const dueDate = record.dueDate ? new Date(`${record.dueDate}T${record.dueTime || '00:00'}:00`) : null;
    if (!dueDate) return false;
    const now = new Date();
    return dueDate.toDateString() === now.toDateString();
  });

  const dueWithin7 = enrichedRecords.filter((record) => {
    if (record.cancelled || record.totalOutstanding <= 0) return false;
    const dueDate = record.dueDate ? new Date(`${record.dueDate}T${record.dueTime || '00:00'}:00`) : null;
    if (!dueDate) return false;
    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();
    return diff > 0 && diff <= 7 * DAY_MS;
  });

  const overdue = enrichedRecords.filter((record) => record.overdue && record.totalOutstanding > 0);

  const recentTransactions = [...repayments, ...records]
    .map((item) => {
      if ('recordId' in item) {
        const record = enrichedRecords.find((entry) => entry.id === item.recordId);
        return {
          id: item.id,
          kind: 'repayment',
          personName: getPersonName(people, item.personId),
          amount: item.amount,
          date: item.date,
          related: record ? record.personName : 'Record',
          type: record ? record.type : 'payment'
        };
      }

      return {
        id: item.id,
        kind: 'record',
        personName: getPersonName(people, item.personId),
        amount: item.principal,
        date: item.date,
        related: item.type === 'lend' ? 'Lent' : 'Borrowed',
        type: item.type
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);

  const monthlySummary = getPastMonths().map((month) => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

    const lentTotal = enrichedRecords
      .filter((record) => record.type === 'lend' && record.date && record.date.startsWith(monthKey))
      .reduce((sum, record) => sum + safeNumber(record.principal), 0);

    const borrowTotal = enrichedRecords
      .filter((record) => record.type === 'borrow' && record.date && record.date.startsWith(monthKey))
      .reduce((sum, record) => sum + safeNumber(record.principal), 0);

    const repaymentsInMonth = repayments.filter((entry) => {
      const record = enrichedRecords.find((item) => item.id === entry.recordId);
      if (!record) return false;
      return entry.date && entry.date.startsWith(monthKey);
    });

    const repaidToMe = repaymentsInMonth
      .filter((entry) => {
        const record = enrichedRecords.find((item) => item.id === entry.recordId);
        return record && record.type === 'lend';
      })
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    const repaidByMe = repaymentsInMonth
      .filter((entry) => {
        const record = enrichedRecords.find((item) => item.id === entry.recordId);
        return record && record.type === 'borrow';
      })
      .reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

    return {
      label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(month),
      lent: lentTotal,
      borrow: borrowTotal,
      received: repaidToMe,
      repaid: repaidByMe,
      monthKey
    };
  });

  return {
    totalLent,
    totalBorrowed,
    totalReceived,
    totalRepaid,
    amountOwedToMe,
    amountIOwe,
    dueToday: dueToday.length,
    dueWithin7: dueWithin7.length,
    overdue: overdue.length,
    recentTransactions,
    monthlySummary,
    enrichedRecords
  };
};

const buildMessageText = ({ template, person, record, amount, settings, customText }) => {
  const personName = person?.name || 'Name';
  const dueDate = record?.dueDate || new Date().toISOString().slice(0, 10);
  const dueTime = record?.dueTime || '18:00';
  const currency = settings.currency || 'MVR';
  const totalAmount = amount || record?.totalOutstanding || 0;

  const templateMap = {
    friendly: `Hello ${personName}, this is a friendly reminder that your repayment of ${currency} ${totalAmount} is due on ${dueDate} at ${dueTime}. Please let me know when you expect to make the payment. Thank you.`,
    dueToday: `Hello ${personName}, this is a reminder that your repayment of ${currency} ${totalAmount} is due today at ${dueTime}. Please confirm when you will make the payment. Thank you.`,
    overdue: `Hello ${personName}, our records show that ${currency} ${totalAmount} remains outstanding and the agreed repayment date was ${dueDate}. Please contact me to confirm when you can settle the balance. Thank you.`,
    partial: `Hello ${personName}, thank you for the partial payment. Your outstanding balance is now ${currency} ${totalAmount}. Please let me know when you can complete the remaining amount. Thank you.`,
    final: `Hello ${personName}, thank you for the final payment. This settles your balance in full. We appreciate your cooperation. Thank you.`,
    custom: customText || settings.defaultMessage || 'Hello [Name], thank you for your cooperation.'
  };

  return templateMap[template] || templateMap.friendly;
};

function App() {
  const [appState, setAppState] = React.useState(getInitialState);
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [personForm, setPersonForm] = React.useState({
    name: '',
    phone: '',
    address: '',
    notes: ''
  });
  const [recordForm, setRecordForm] = React.useState({
    personId: '',
    type: 'lend',
    principal: '',
    interest: 0,
    fees: 0,
    date: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    dueTime: '18:00',
    paymentMethod: 'Bank transfer',
    schedule: 'One-time',
    description: '',
    notes: ''
  });
  const [repaymentForm, setRepaymentForm] = React.useState({
    personId: '',
    recordId: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    time: '12:00',
    method: 'Bank transfer',
    allocation: 'principal',
    note: ''
  });
  const [messageState, setMessageState] = React.useState({
    template: 'friendly',
    personId: '',
    recordId: '',
    customText: '',
    amount: ''
  });
  const [deferredPrompt, setDeferredPrompt] = React.useState(null);
  const [promptMessage, setPromptMessage] = React.useState('');

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }, [appState]);

  React.useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const personList = appState.people.filter((person) => !person.archived);
  const archivedPeople = appState.people.filter((person) => person.archived);
  const dashboard = computeDashboard(appState.people, appState.records, appState.repayments, appState.settings);
  const reminderNotifications = React.useMemo(() => {
    return buildReminderNotifications(appState.records, appState.repayments, appState.settings).map((notice) => ({
      ...notice,
      createdAt: notice.createdAt
    }));
  }, [appState.records, appState.repayments, appState.settings]);

  const notifications = React.useMemo(() => {
    const unique = new Map();
    [...(appState.notifications || []), ...reminderNotifications].forEach((notice) => {
      if (!unique.has(notice.id)) unique.set(notice.id, notice);
    });
    return Array.from(unique.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [appState.notifications, reminderNotifications]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  const filterPeople = personList.filter((person) => {
    const searchText = searchTerm.toLowerCase();
    return !searchText || person.name.toLowerCase().includes(searchText) || person.phone.toLowerCase().includes(searchText);
  });

  const selectedPerson = appState.people.find((person) => person.id === messageState.personId) || null;
  const selectedRecord = appState.records.find((record) => record.id === messageState.recordId) || null;
  const messageText = buildMessageText({
    template: messageState.template,
    person: selectedPerson,
    record: selectedRecord,
    amount: Number(messageState.amount || selectedRecord?.totalOutstanding || 0),
    settings: appState.settings,
    customText: messageState.customText
  });

  const createNotification = (title, message, recordId = null) => {
    const notice = {
      id: `${Date.now()}-${Math.random()}`,
      type: 'custom',
      title,
      message,
      recordId,
      read: false,
      createdAt: new Date().toISOString(),
      link: recordId ? `/records/${recordId}` : '/'
    };
    setAppState((current) => ({
      ...current,
      notifications: [notice, ...(current.notifications || [])]
    }));
  };

  const requestBrowserNotification = (title, body) => {
    if (!appState.settings.notificationsEnabled) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };

  const markNotificationRead = (id) => {
    setAppState((current) => ({
      ...current,
      notifications: (current.notifications || []).map((item) => (item.id === id ? { ...item, read: true } : item))
    }));
  };

  const updatePerson = (event) => {
    const { name, value } = event.target;
    setPersonForm((current) => ({ ...current, [name]: value }));
  };

  const updateRecord = (event) => {
    const { name, value } = event.target;
    setRecordForm((current) => ({ ...current, [name]: value }));
  };

  const updateRepayment = (event) => {
    const { name, value } = event.target;
    setRepaymentForm((current) => ({ ...current, [name]: value }));
  };

  const handleAddPerson = (event) => {
    event.preventDefault();
    const cleanName = personForm.name.trim();
    const cleanPhone = personForm.phone.trim();

    if (!cleanName || !cleanPhone) {
      setPromptMessage('Please add a full name and valid phone number.');
      return;
    }

    const duplicate = appState.people.find((person) => person.phone === cleanPhone || person.name.toLowerCase() === cleanName.toLowerCase());
    if (duplicate) {
      setPromptMessage('A matching person already exists. Please check the contact list before adding a duplicate.');
      return;
    }

    const newPerson = {
      id: `p-${Date.now()}`,
      name: cleanName,
      phone: cleanPhone,
      address: personForm.address.trim(),
      notes: personForm.notes.trim(),
      createdAt: new Date().toISOString(),
      archived: false
    };

    setAppState((current) => ({
      ...current,
      people: [newPerson, ...current.people]
    }));

    setPersonForm({ name: '', phone: '', address: '', notes: '' });
    setPromptMessage('Person added successfully.');
    setActiveTab('people');
  };

  const handleArchivePerson = (personId) => {
    setAppState((current) => ({
      ...current,
      people: current.people.map((person) => (person.id === personId ? { ...person, archived: true } : person))
    }));
  };

  const handleRestorePerson = (personId) => {
    setAppState((current) => ({
      ...current,
      people: current.people.map((person) => (person.id === personId ? { ...person, archived: false } : person))
    }));
  };

  const handleAddRecord = (event) => {
    event.preventDefault();
    const principal = Number(recordForm.principal);
    if (!recordForm.personId || !principal || principal <= 0) {
      setPromptMessage('Please select a person and enter a valid amount.');
      return;
    }

    const newRecord = {
      id: `r-${Date.now()}`,
      personId: recordForm.personId,
      type: recordForm.type,
      principal,
      interest: Number(recordForm.interest || 0),
      fees: Number(recordForm.fees || 0),
      paymentMethod: recordForm.paymentMethod,
      description: recordForm.description.trim(),
      notes: recordForm.notes.trim(),
      schedule: recordForm.schedule,
      date: recordForm.date,
      dueDate: recordForm.dueDate,
      dueTime: recordForm.dueTime,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cancelled: false,
      status: 'Upcoming'
    };

    setAppState((current) => ({
      ...current,
      records: [newRecord, ...current.records]
    }));

    const title = recordForm.type === 'lend' ? 'Money lent recorded' : 'Money borrowed recorded';
    const body = `${getPersonName(appState.people, recordForm.personId)} - ${currencyFormatter(principal, appState.settings.currency)}`;
    createNotification(title, body, newRecord.id);
    requestBrowserNotification(title, body);
    setPromptMessage('Record saved successfully.');
    setRecordForm({
      personId: '',
      type: recordForm.type,
      principal: '',
      interest: 0,
      fees: 0,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      dueTime: '18:00',
      paymentMethod: 'Bank transfer',
      schedule: 'One-time',
      description: '',
      notes: ''
    });
    setActiveTab('records');
  };

  const handleAddRepayment = (event) => {
    event.preventDefault();
    const amount = Number(repaymentForm.amount);
    const selectedRecord = appState.records.find((record) => record.id === repaymentForm.recordId);

    if (!repaymentForm.personId || !repaymentForm.recordId || !selectedRecord) {
      setPromptMessage('Please select the person and linked record.');
      return;
    }

    const metrics = getRecordMetrics(selectedRecord, appState.repayments);
    const validAmount = amount > 0 && amount <= metrics.totalOutstanding + 0.0001;

    if (!validAmount) {
      const proceed = window.confirm(`This repayment exceeds the current outstanding balance of ${currencyFormatter(metrics.totalOutstanding, appState.settings.currency)}. Do you want to continue?`);
      if (!proceed) return;
    }

    const newRepayment = {
      id: `rp-${Date.now()}`,
      recordId: repaymentForm.recordId,
      personId: repaymentForm.personId,
      amount,
      allocation: repaymentForm.allocation,
      date: repaymentForm.date,
      time: repaymentForm.time,
      method: repaymentForm.method,
      note: repaymentForm.note || 'Payment recorded',
      createdAt: new Date().toISOString()
    };

    setAppState((current) => ({
      ...current,
      repayments: [newRepayment, ...current.repayments]
    }));

    const title = 'Repayment recorded';
    const body = `${getPersonName(appState.people, repaymentForm.personId)} paid ${currencyFormatter(amount, appState.settings.currency)}`;
    createNotification(title, body, selectedRecord.id);
    requestBrowserNotification(title, body);
    setPromptMessage('Repayment saved successfully.');
    setRepaymentForm({
      personId: '',
      recordId: '',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      time: '12:00',
      method: 'Bank transfer',
      allocation: 'principal',
      note: ''
    });
    setActiveTab('records');
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setPromptMessage('Message copied to clipboard.');
    } catch (error) {
      setPromptMessage('Clipboard access failed. Please copy the message manually.');
    }
  };

  const handleWhatsApp = () => {
    const phone = selectedPerson?.phone || '';
    if (!phone) {
      setPromptMessage('Please select a person before opening WhatsApp.');
      return;
    }
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(messageText)}`, '_blank');
  };

  const handleSMS = () => {
    const phone = selectedPerson?.phone || '';
    if (!phone) {
      setPromptMessage('Please select a person before creating an SMS.');
      return;
    }
    window.location.href = `sms:${phone}?body=${encodeURIComponent(messageText)}`;
  };

  const installApp = async () => {
    if (!deferredPrompt) {
      setPromptMessage('App installation is not available in this browser yet.');
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const markAllRead = () => {
    setAppState((current) => ({
      ...current,
      notifications: (current.notifications || []).map((item) => ({ ...item, read: true }))
    }));
  };

  const selectedRecordDetails = dashboard.enrichedRecords.find((record) => record.id === repaymentForm.recordId) || null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-icon">M</div>
          <div>
            <span className="eyebrow">Personal finance</span>
            <h1>{appState.settings.appName}</h1>
          </div>
        </div>

        <div className="toolbar-actions">
          <button className="outline" onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className="outline" onClick={() => setActiveTab('people')}>People</button>
          <button className="outline" onClick={() => setActiveTab('records')}>Records</button>
          <button className="primary" onClick={() => setActiveTab('messages')}>Messages</button>
          {deferredPrompt && <button className="gold" onClick={installApp}>Install app</button>}
          <div className="notification-pill">
            <span>🔔</span>
            <strong>{unreadCount}</strong>
          </div>
        </div>
      </header>

      {promptMessage && <div className="alert-banner">{promptMessage}</div>}

      <main className="workspace">
        <aside className="sidebar">
          <nav className="nav-stack">
            <button className={activeTab === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('dashboard')}>
              Dashboard
            </button>
            <button className={activeTab === 'people' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('people')}>
              Contacts
            </button>
            <button className={activeTab === 'records' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('records')}>
              Records
            </button>
            <button className={activeTab === 'notifications' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('notifications')}>
              Alerts
            </button>
            <button className={activeTab === 'messages' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('messages')}>
              Message generator
            </button>
            <button className={activeTab === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('settings')}>
              Settings
            </button>
          </nav>

          <div className="mini-card">
            <h3>Quick actions</h3>
            <div className="quick-grid">
              <button onClick={() => setActiveTab('people')}>Add Person</button>
              <button onClick={() => setActiveTab('records')}>Lend Money</button>
              <button onClick={() => setActiveTab('records')}>Borrow Money</button>
              <button onClick={() => setActiveTab('records')}>Record Repayment</button>
              <button onClick={() => setActiveTab('dashboard')}>View History</button>
            </div>
          </div>
        </aside>

        <section className="main-panel">
          {activeTab === 'dashboard' && (
            <>
              <div className="hero-row">
                <div className="hero-card summary-card positive">
                  <span>Total lent</span>
                  <strong>{currencyFormatter(dashboard.totalLent, appState.settings.currency)}</strong>
                </div>
                <div className="hero-card summary-card negative">
                  <span>Total borrowed</span>
                  <strong>{currencyFormatter(dashboard.totalBorrowed, appState.settings.currency)}</strong>
                </div>
                <div className="hero-card summary-card positive">
                  <span>Received</span>
                  <strong>{currencyFormatter(dashboard.totalReceived, appState.settings.currency)}</strong>
                </div>
                <div className="hero-card summary-card negative">
                  <span>Repaid</span>
                  <strong>{currencyFormatter(dashboard.totalRepaid, appState.settings.currency)}</strong>
                </div>
              </div>

              <div className="hero-row second-row">
                <div className="hero-card summary-card green">
                  <span>Owed to me</span>
                  <strong>{currencyFormatter(dashboard.amountOwedToMe, appState.settings.currency)}</strong>
                </div>
                <div className="hero-card summary-card amber">
                  <span>I owe</span>
                  <strong>{currencyFormatter(dashboard.amountIOwe, appState.settings.currency)}</strong>
                </div>
                <div className="hero-card summary-card purple">
                  <span>Due today</span>
                  <strong>{dashboard.dueToday}</strong>
                </div>
                <div className="hero-card summary-card orange">
                  <span>Due in 7 days</span>
                  <strong>{dashboard.dueWithin7}</strong>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="panel-card widget">
                  <div className="section-header">
                    <h3>Recent transactions</h3>
                  </div>
                  <ul className="transaction-list">
                    {dashboard.recentTransactions.map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.personName}</strong>
                          <small>{item.kind === 'repayment' ? 'Repayment' : item.related}</small>
                        </div>
                        <div className="amount-group">
                          <span className={item.type === 'lend' ? 'pos' : 'neg'}>{currencyFormatter(item.amount, appState.settings.currency)}</span>
                          <small>{formatDate(item.date)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="panel-card widget">
                  <div className="section-header">
                    <h3>Overdue / alerts</h3>
                  </div>
                  <div className="stat-badges">
                    <span className="badge danger">Overdue: {dashboard.overdue}</span>
                    <span className="badge warn">Due today: {dashboard.dueToday}</span>
                  </div>
                  <ul className="list-compact">
                    {dashboard.enrichedRecords.filter((record) => record.overdue).slice(0, 5).map((record) => (
                      <li key={record.id}>{record.personName} — {currencyFormatter(record.totalOutstanding, appState.settings.currency)}</li>
                    ))}
                  </ul>
                </div>

                <div className="panel-card widget wide">
                  <div className="section-header">
                    <h3>Monthly summary</h3>
                  </div>
                  <div className="month-chart">
                    {dashboard.monthlySummary.map((month) => (
                      <div key={month.monthKey} className="month-bar-group">
                        <div className="month-label">{month.label}</div>
                        <div className="bar-stack">
                          <span className="bar lent" style={{ height: `${Math.min((month.lent / 6000) * 100, 100)}%` }}></span>
                          <span className="bar recv" style={{ height: `${Math.min((month.received / 6000) * 100, 100)}%` }}></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'people' && (
            <div className="two-column-grid">
              <div className="panel-card">
                <div className="section-header">
                  <h3>Add person</h3>
                </div>
                <form className="stack-form" onSubmit={handleAddPerson}>
                  <input name="name" value={personForm.name} onChange={updatePerson} placeholder="Full name" />
                  <input name="phone" value={personForm.phone} onChange={updatePerson} placeholder="Phone number with country code" />
                  <input name="address" value={personForm.address} onChange={updatePerson} placeholder="Address or identifying note" />
                  <textarea name="notes" value={personForm.notes} onChange={updatePerson} placeholder="Private notes" />
                  <button className="primary" type="submit">Save person</button>
                </form>
              </div>

              <div className="panel-card">
                <div className="section-header">
                  <h3>People</h3>
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name or phone" />
                </div>
                <div className="person-list">
                  {filterPeople.length > 0 ? filterPeople.map((person) => (
                    <div key={person.id} className="person-card">
                      <div className="person-header">
                        <div className="avatar">{person.name.slice(0, 1).toUpperCase()}</div>
                        <div>
                          <strong>{person.name}</strong>
                          <small>{person.phone}</small>
                        </div>
                      </div>

                      <div className="mini-metrics">
                        <span>Lent: {currencyFormatter(appState.records.filter((record) => record.personId === person.id && record.type === 'lend').reduce((sum, item) => sum + safeNumber(item.principal), 0), appState.settings.currency)}</span>
                        <span>Borrowed: {currencyFormatter(appState.records.filter((record) => record.personId === person.id && record.type === 'borrow').reduce((sum, item) => sum + safeNumber(item.principal), 0), appState.settings.currency)}</span>
                      </div>

                      <div className="actions-row">
                        <button className="outline" onClick={() => { setMessageState((current) => ({ ...current, personId: person.id })); setActiveTab('messages'); }}>Message</button>
                        <button className="outline" onClick={() => handleArchivePerson(person.id)}>Archive</button>
                      </div>
                    </div>
                  )) : <p>No matching people found.</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'records' && (
            <div className="two-column-grid">
              <div className="panel-card">
                <div className="section-header">
                  <h3>Add loan or debt</h3>
                </div>
                <form className="stack-form" onSubmit={handleAddRecord}>
                  <select name="personId" value={recordForm.personId} onChange={updateRecord}>
                    <option value="">Select person</option>
                    {appState.people.filter((person) => !person.archived).map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>

                  <select name="type" value={recordForm.type} onChange={updateRecord}>
                    <option value="lend">Money lent</option>
                    <option value="borrow">Money borrowed</option>
                  </select>

                  <input name="principal" type="number" min="0" value={recordForm.principal} onChange={updateRecord} placeholder="Principal amount" />
                  <div className="inline-inputs">
                    <input name="interest" type="number" min="0" value={recordForm.interest} onChange={updateRecord} placeholder="Interest" />
                    <input name="fees" type="number" min="0" value={recordForm.fees} onChange={updateRecord} placeholder="Fees" />
                  </div>
                  <div className="inline-inputs">
                    <input name="date" type="date" value={recordForm.date} onChange={updateRecord} />
                    <input name="dueDate" type="date" value={recordForm.dueDate} onChange={updateRecord} />
                  </div>
                  <input name="dueTime" type="time" value={recordForm.dueTime} onChange={updateRecord} />
                  <select name="paymentMethod" value={recordForm.paymentMethod} onChange={updateRecord}>
                    <option>Bank transfer</option>
                    <option>Cash</option>
                    <option>Mobile wallet</option>
                    <option>Cheque</option>
                  </select>
                  <input name="schedule" value={recordForm.schedule} onChange={updateRecord} placeholder="Installment schedule" />
                  <input name="description" value={recordForm.description} onChange={updateRecord} placeholder="Description" />
                  <textarea name="notes" value={recordForm.notes} onChange={updateRecord} placeholder="Private notes" />
                  <button className="primary" type="submit">Save record</button>
                </form>
              </div>

              <div className="panel-card">
                <div className="section-header">
                  <h3>Record repayment</h3>
                </div>
                <form className="stack-form" onSubmit={handleAddRepayment}>
                  <select name="personId" value={repaymentForm.personId} onChange={(event) => {
                    updateRepayment(event);
                    const personId = event.target.value;
                    const firstRecord = appState.records.find((record) => record.personId === personId);
                    setRepaymentForm((current) => ({ ...current, personId, recordId: firstRecord ? firstRecord.id : '' }));
                  }}>
                    <option value="">Select person</option>
                    {appState.people.filter((person) => !person.archived).map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>

                  <select name="recordId" value={repaymentForm.recordId} onChange={updateRepayment}>
                    <option value="">Select linked record</option>
                    {appState.records
                      .filter((record) => record.personId === repaymentForm.personId)
                      .map((record) => (
                        <option key={record.id} value={record.id}>{record.type} · {currencyFormatter(record.principal, appState.settings.currency)}</option>
                      ))}
                  </select>

                  {selectedRecordDetails && (
                    <div className="record-summary-box">
                      <span>Outstanding: {currencyFormatter(selectedRecordDetails.totalOutstanding, appState.settings.currency)}</span>
                      <span>Status: {selectedRecordDetails.status}</span>
                    </div>
                  )}

                  <input name="amount" type="number" min="0" value={repaymentForm.amount} onChange={updateRepayment} placeholder="Amount paid" />
                  <div className="inline-inputs">
                    <input name="date" type="date" value={repaymentForm.date} onChange={updateRepayment} />
                    <input name="time" type="time" value={repaymentForm.time} onChange={updateRepayment} />
                  </div>
                  <select name="allocation" value={repaymentForm.allocation} onChange={updateRepayment}>
                    <option value="principal">Principal</option>
                    <option value="interest">Interest</option>
                    <option value="fees">Fees</option>
                  </select>
                  <select name="method" value={repaymentForm.method} onChange={updateRepayment}>
                    <option>Bank transfer</option>
                    <option>Cash</option>
                    <option>Mobile wallet</option>
                    <option>Card</option>
                  </select>
                  <textarea name="note" value={repaymentForm.note} onChange={updateRepayment} placeholder="Reference or notes" />
                  <button className="primary" type="submit">Save payment</button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="panel-card">
              <div className="section-header">
                <h3>Notification center</h3>
                <button className="outline" onClick={markAllRead}>Mark all read</button>
              </div>
              <div className="notification-stack">
                {notifications.length ? notifications.map((notice) => (
                  <div key={notice.id} className={notice.read ? 'notification-item read' : 'notification-item'}>
                    <div className="notification-header">
                      <strong>{notice.title}</strong>
                      <small>{formatDateTime(notice.createdAt)}</small>
                    </div>
                    <p>{notice.message}</p>
                    <button className="outline" onClick={() => markNotificationRead(notice.id)}>Mark read</button>
                  </div>
                )) : <p>No notifications yet.</p>}
              </div>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="panel-card message-panel">
              <div className="section-header">
                <h3>WhatsApp and SMS generator</h3>
              </div>

              <div className="message-controls">
                <select value={messageState.template} onChange={(event) => setMessageState((current) => ({ ...current, template: event.target.value }))}>
                  <option value="friendly">Friendly upcoming reminder</option>
                  <option value="dueToday">Due-today reminder</option>
                  <option value="overdue">Polite overdue reminder</option>
                  <option value="partial">Partial-payment confirmation</option>
                  <option value="final">Final-payment confirmation</option>
                  <option value="custom">Custom reminder</option>
                </select>

                <select value={messageState.personId} onChange={(event) => setMessageState((current) => ({ ...current, personId: event.target.value }))}>
                  <option value="">Select person</option>
                  {appState.people.filter((person) => !person.archived).map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>

                <select value={messageState.recordId} onChange={(event) => setMessageState((current) => ({ ...current, recordId: event.target.value }))}>
                  <option value="">Linked record</option>
                  {appState.records
                    .filter((record) => record.personId === messageState.personId)
                    .map((record) => (
                      <option key={record.id} value={record.id}>{record.type} · {currencyFormatter(record.totalOutstanding, appState.settings.currency)}</option>
                    ))}
                </select>

                <input value={messageState.amount} onChange={(event) => setMessageState((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount override" />
              </div>

              {messageState.template === 'custom' && (
                <textarea value={messageState.customText} onChange={(event) => setMessageState((current) => ({ ...current, customText: event.target.value }))} rows="6" placeholder="Write your custom message here" />
              )}

              <textarea rows="8" value={messageText} onChange={(event) => setMessageState((current) => ({ ...current, customText: event.target.value }))} />

              <div className="button-row">
                <button className="primary" onClick={handleCopyMessage}>Copy</button>
                <button className="outline" onClick={handleWhatsApp}>Open WhatsApp</button>
                <button className="outline" onClick={handleSMS}>Open SMS</button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="panel-card settings-card">
              <div className="section-header">
                <h3>Settings</h3>
              </div>

              <div className="settings-grid">
                <label>
                  App name
                  <input value={appState.settings.appName} onChange={(event) => setAppState((current) => ({ ...current, settings: { ...current.settings, appName: event.target.value } }))} />
                </label>

                <label>
                  Default currency
                  <input value={appState.settings.currency} onChange={(event) => setAppState((current) => ({ ...current, settings: { ...current.settings, currency: event.target.value } }))} />
                </label>

                <label>
                  Reminder days before due date
                  <input type="number" min="1" value={appState.settings.reminderDays} onChange={(event) => setAppState((current) => ({ ...current, settings: { ...current.settings, reminderDays: Number(event.target.value) } }))} />
                </label>

                <label className="switch-row">
                  <span>Browser notifications</span>
                  <input type="checkbox" checked={appState.settings.notificationsEnabled} onChange={(event) => setAppState((current) => ({ ...current, settings: { ...current.settings, notificationsEnabled: event.target.checked } }))} />
                </label>
              </div>

              <div className="button-row">
                <button className="primary" onClick={() => requestBrowserNotification('Notifications enabled', 'Browser reminders are active for this device.')}>Enable device alerts</button>
                <button className="outline" onClick={() => setPromptMessage('Background push notifications require a secure host, a service worker, and browser permission. This app uses browser notifications when available.')}>Learn about push support</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
