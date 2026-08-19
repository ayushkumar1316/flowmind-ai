const priorityWeights = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const getTodayKey = () => new Date().toLocaleDateString("en-CA");

export const parseDuration = (value = "") => {
  const text = String(value).toLowerCase();
  const number = parseFloat(text) || 0;
  if (text.includes("min")) return number / 60;
  return number;
};

export const normalizePriority = (priority) => (priority ? String(priority).toUpperCase() : "MEDIUM");

export const getTaskCompletionKey = (task) => {
  if (task?.completedDate) return String(task.completedDate).slice(0, 10);
  if (task?.completedAt) return String(task.completedAt).slice(0, 10);
  if (task?.lastProgressDate) return String(task.lastProgressDate).slice(0, 10);
  return "";
};

export const normalizeDashboardTask = (task, index = 0) => {
  const source = typeof task === "string" ? { title: task } : (task || {});
  const deadlineValue = source.deadlineDays ?? source.daysRemaining;
  const completed = source.status === "Completed" || source.completed === true;
  const completedAt = source.completedAt || source.completedDate || source.lastProgressDate || null;

  return {
    ...source,
    id: source.id ?? `task-${index}`,
    title: source.title || source.task || "Untitled task",
    status: completed ? "Completed" : (source.status || "To Do"),
    completed,
    completedAt,
    completedDate: source.completedDate || (completedAt ? String(completedAt).slice(0, 10) : undefined),
    priority: normalizePriority(source.priority),
    deadlineDays: Number.isFinite(Number(deadlineValue)) ? Number(deadlineValue) : null,
    estimatedTime: source.estimatedTime || source.duration || source.timeEstimate || "",
    isRepeating: Boolean(source.isRepeating),
    currentCount: Number(source.currentCount || 0),
    targetCount: Number(source.targetCount || 0),
    createdAt: source.createdAt || source.id || index,
    raw: task,
  };
};

export const getPlanTasks = (plan) => {
  if (!plan) return [];
  if (Array.isArray(plan.taskBoardTasks)) return plan.taskBoardTasks.map(normalizeDashboardTask);
  if (Array.isArray(plan.todayPlan)) return plan.todayPlan.map(normalizeDashboardTask);
  if (Array.isArray(plan.strictlyDoToday)) return plan.strictlyDoToday.map(normalizeDashboardTask);
  return [];
};

export const sortByExecutionPriority = (a, b) => {
  const priorityDelta = (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0);
  if (priorityDelta) return priorityDelta;

  const deadlineDelta = (a.deadlineDays ?? 999) - (b.deadlineDays ?? 999);
  if (deadlineDelta) return deadlineDelta;

  const durationDelta = parseDuration(a.estimatedTime) - parseDuration(b.estimatedTime);
  if (durationDelta) return durationDelta;

  return String(a.createdAt).localeCompare(String(b.createdAt));
};

const daysBetweenKeys = (fromKey, toKey) => {
  if (!fromKey || !toKey) return Infinity;
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
};

export const resolveProductivityStreak = (stats = {}) => {
  const today = getTodayKey();
  const lastCompletionDate = stats.lastCompletionDate || stats.lastActiveDate || null;
  const currentStreak = Number(stats.currentStreak || 0);

  if (!lastCompletionDate) {
    return { ...stats, currentStreak: 0 };
  }

  const gap = daysBetweenKeys(lastCompletionDate, today);
  if (gap <= 1) {
    return { ...stats, currentStreak };
  }

  return { ...stats, currentStreak: 0 };
};

export const getProductivityStreak = (profile = null, plan = null) => {
  const stats = profile?.stats || {};
  const resolved = resolveProductivityStreak(stats);
  const fromProfile = Number(resolved.currentStreak || 0);
  if (fromProfile > 0 || stats.lastCompletionDate || stats.lastActiveDate) {
    return fromProfile;
  }
  return Number(plan?.currentStreak ?? plan?.productivityStreak ?? plan?.streak?.current ?? 0);
};

export const getConfidenceMeta = (score) => {
  const value = Number(score) || 0;
  if (value >= 80) {
    return {
      text: "You're doing great!",
      badge: "ON TRACK",
      badgeColor: "bg-green-50 text-green-700 border-green-200",
      color: "bg-green-500",
      hex: "#22c55e",
      textColor: "text-green-600",
    };
  }
  if (value >= 60) {
    return {
      text: "Moderate risk. Keep pushing.",
      badge: "AT RISK",
      badgeColor: "bg-yellow-50 text-yellow-700 border-yellow-200",
      color: "bg-yellow-500",
      hex: "#eab308",
      textColor: "text-yellow-600",
    };
  }
  return {
    text: "Critical risk of missing goals.",
    badge: "CRITICAL",
    badgeColor: "bg-red-50 text-red-700 border-red-200",
    color: "bg-red-500",
    hex: "#ef4444",
    textColor: "text-red-600",
  };
};

export const buildCalendarMeta = (viewDate, tasks = [], referenceDate = new Date()) => {
  const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const year = date.getFullYear();
  const month = date.getMonth();
  const todayDate = new Date(referenceDate);
  const today = todayDate.getDate();
  const isCurrentMonth = todayDate.getFullYear() === year && todayDate.getMonth() === month;
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year + 1, 0, 0).getDate();
  const deadlineDays = new Set();
  const completedDays = new Set();

  const refForDeadlines = new Date(referenceDate);
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  safeTasks.forEach((task) => {
    if (task.status === "Completed") {
      const completionKey = getTaskCompletionKey(task);
      if (completionKey) {
        const completionDate = new Date(`${completionKey}T12:00:00`);
        if (completionDate.getFullYear() === year && completionDate.getMonth() === month) {
          completedDays.add(completionDate.getDate());
        }
      }
    }

    if (task.status !== "Completed" && task.deadlineDays !== null && task.deadlineDays >= 0) {
      const deadline = new Date(refForDeadlines);
      deadline.setDate(refForDeadlines.getDate() + task.deadlineDays);
      if (deadline.getFullYear() === year && deadline.getMonth() === month) {
        deadlineDays.add(deadline.getDate());
      }
    }
  });

  return {
    year,
    month,
    label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    today: isCurrentMonth ? today : null,
    deadlineDays,
    completedDays,
    days: Array.from({ length: 42 }, (_, index) => {
      const day = index - firstWeekday + 1;
      return day > 0 && day <= daysInMonth ? day : null;
    }),
  };
};

export const getSyncStatus = ({ isSyncing, syncedAtMs, nowMs = Date.now() }) => {
  if (isSyncing) {
    return { label: "Syncing...", tone: "syncing" };
  }
  if (!syncedAtMs) {
    return { label: "Everything Synced", tone: "synced" };
  }
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000));
  if (elapsedSeconds < 15) {
    return { label: "Everything Synced", tone: "synced" };
  }
  if (elapsedSeconds < 60) {
    return { label: `Last synced ${elapsedSeconds} sec ago`, tone: "recent" };
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes === 1) {
    return { label: "Last synced 1 minute ago", tone: "recent" };
  }
  if (elapsedMinutes < 60) {
    return { label: `Last synced ${elapsedMinutes} minutes ago`, tone: "recent" };
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours === 1) {
    return { label: "Last synced 1 hour ago", tone: "recent" };
  }
  return { label: `Last synced ${elapsedHours} hours ago`, tone: "recent" };
};

export const getDisplayName = (profile, user) =>
  profile?.profile?.name || profile?.displayName || user?.displayName || null;

export const getDisplayRole = (profile, user, developerEmail = "") => {
  if (user?.email === developerEmail) return "Developer";
  return profile?.profile?.occupation || profile?.role || "";
};

export const buildTaskMetrics = (plan = null, profile = null) => {
  const normalizedTasks = getPlanTasks(plan);
  const todayKey = getTodayKey();
  const completedTasks = normalizedTasks.filter((task) => task.status === "Completed");
  const activeTasks = normalizedTasks.filter((task) => task.status !== "Completed").sort(sortByExecutionPriority);
  const executionTasks = activeTasks.filter((task) => !task.isRepeating);
  const repeatingHabits = activeTasks.filter((task) => task.isRepeating);
  const completedToday = completedTasks.filter((task) => getTaskCompletionKey(task) === todayKey);
  const totalTaskCount = normalizedTasks.length;
  const completedTaskCount = completedTasks.length;
  const pendingTasks = activeTasks.length;
  const progressPercentage = totalTaskCount === 0 ? 0 : Math.round((completedTaskCount / totalTaskCount) * 100);
  const successChance = progressPercentage;
  const todaysProgress = totalTaskCount === 0 ? 0 : Math.round((completedToday.length / totalTaskCount) * 100);
  const upcomingDeadlines = activeTasks
    .filter((task) => task.deadlineDays !== null)
    .sort(sortByExecutionPriority)
    .slice(0, 3);

  return {
    tasks: normalizedTasks,
    activeTasks,
    executionTasks,
    repeatingHabits,
    todayTasks: executionTasks.slice(0, 5),
    focusTask: executionTasks[0] || null,
    upcomingDeadlines,
    completedTasks,
    completedToday,
    pendingTasks,
    totalTaskCount,
    completedTaskCount,
    completedTodayCount: completedToday.length,
    progressPercentage,
    successChance,
    todaysProgress,
    productivityStreak: getProductivityStreak(profile, plan),
    onlyRepeatingHabitsRemain: executionTasks.length === 0 && repeatingHabits.length > 0,
  };
};
