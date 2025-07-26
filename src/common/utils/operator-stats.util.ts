import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import parseDuration from 'parse-duration';

dayjs.extend(duration);

export interface OperatorStats {
  average_duration: string;
  average_pass_rate: number;
  first_test_date: Date | null;
  first_test_id: string;
  last_test_date: Date | null;
  last_test_id: string;
  total_failed_tests: number;
  total_passed_tests: number;
  total_test_sessions: number;
}

export interface ResultData {
  _id: unknown;
  createdAt: Date | string;
  summary?: {
    passed?: number;
    failed?: number;
    duration?: string;
  };
}

interface StatsAccumulator {
  firstResult: { date: Date; id: string } | null;
  lastResult: { date: Date; id: string } | null;
  totalDurationMs: number;
  totalFailed: number;
  totalPassed: number;
  validSessionCount: number;
}

interface TimeComponents {
  hours: number;
  minutes: number;
  seconds: number;
}

const DEFAULT_DURATION = '0s';
const TIME_FORMAT_REGEX = /^(\d+):(\d+):(\d+)$/;
const MAX_MINUTES = 60;
const MAX_SECONDS = 60;
const PRECISION_MULTIPLIER = 10000;
const PRECISION_DIVISOR = 100;

export const DEFAULT_STATS: OperatorStats = {
  average_duration: DEFAULT_DURATION,
  average_pass_rate: 0,
  first_test_date: null,
  first_test_id: '',
  last_test_date: null,
  last_test_id: '',
  total_failed_tests: 0,
  total_passed_tests: 0,
  total_test_sessions: 0,
};

export const calculateOperatorStatsFromResults = (results: ResultData[]): OperatorStats => {
  if (!Array.isArray(results) || results.length === 0) {
    return { ...DEFAULT_STATS };
  }

  const initialAccumulator: StatsAccumulator = {
    firstResult: null,
    lastResult: null,
    totalDurationMs: 0,
    totalFailed: 0,
    totalPassed: 0,
    validSessionCount: 0,
  };

  try {
    const finalStats = results.reduce((acc, result) => {
      const resultDate = result.createdAt ? new Date(result.createdAt) : null;
      if (!result.summary || !resultDate || isNaN(resultDate.getTime())) {
        return acc;
      }

      const { summary } = result;
      const passed = summary.passed ?? 0;
      const failed = summary.failed ?? 0;
      const resultId = String(result._id);

      acc.totalPassed += passed;
      acc.totalFailed += failed;
      acc.totalDurationMs += parseDurationToMs(summary.duration);
      acc.validSessionCount++;

      if (!acc.firstResult || resultDate < acc.firstResult.date) {
        acc.firstResult = { date: resultDate, id: resultId };
      }
      if (!acc.lastResult || resultDate > acc.lastResult.date) {
        acc.lastResult = { date: resultDate, id: resultId };
      }

      return acc;
    }, initialAccumulator);

    return buildStatsObject(finalStats);
  } catch (error) {
    console.error('Error calculating stats from results:', error);
    return { ...DEFAULT_STATS };
  }
};

export const parseDurationToMs = (durationStr: string | undefined): number => {
  if (!durationStr || typeof durationStr !== 'string' || durationStr === DEFAULT_DURATION) {
    return 0;
  }

  try {
    const ms = parseDuration(durationStr.replace(/\s+/g, ''));
    if (ms !== null && ms > 0) {
      return ms;
    }

    const timeMatch = durationStr.match(TIME_FORMAT_REGEX);
    if (timeMatch) {
      const timeComponents = parseTimeComponents(timeMatch);
      validateTimeComponents(timeComponents);
      return convertTimeComponentsToMs(timeComponents);
    }

    console.warn(`Invalid duration format: "${durationStr}", defaulting to 0ms.`);
    return 0;
  } catch (error) {
    console.warn(`Error parsing duration "${durationStr}":`, error);
    return 0;
  }
};

export const formatDuration = (ms: number): string => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
    return DEFAULT_DURATION;
  }

  const d = dayjs.duration(ms);
  const parts: string[] = [];

  if (d.hours() > 0) parts.push(`${d.hours()}h`);
  if (d.minutes() > 0) parts.push(`${d.minutes()}m`);
  if (d.seconds() > 0 || parts.length === 0) {
    parts.push(`${d.seconds()}s`);
  }

  return parts.join(' ');
};

export const getDefaultOperatorStats = (): OperatorStats => ({ ...DEFAULT_STATS });

const buildStatsObject = (acc: StatsAccumulator): OperatorStats => {
  const totalTests = acc.totalPassed + acc.totalFailed;
  const averagePassRate = calculatePassRate(acc.totalPassed, totalTests);
  const averageDurationMs = acc.validSessionCount > 0 ? acc.totalDurationMs / acc.validSessionCount : 0;

  return {
    average_duration: formatDuration(averageDurationMs),
    average_pass_rate: averagePassRate,
    first_test_date: acc.firstResult?.date ?? null,
    first_test_id: acc.firstResult?.id ?? '',
    last_test_date: acc.lastResult?.date ?? null,
    last_test_id: acc.lastResult?.id ?? '',
    total_failed_tests: acc.totalFailed,
    total_passed_tests: acc.totalPassed,
    total_test_sessions: acc.validSessionCount,
  };
};

const calculatePassRate = (passed: number, total: number): number => {
  if (total === 0) {
    return 0;
  }
  return Math.round((passed / total) * PRECISION_MULTIPLIER) / PRECISION_DIVISOR;
};

const parseTimeComponents = (match: RegExpMatchArray): TimeComponents => {
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
    seconds: parseInt(match[3], 10),
  };
};

const validateTimeComponents = (components: TimeComponents): void => {
  if (components.minutes >= MAX_MINUTES || components.seconds >= MAX_SECONDS) {
    throw new Error('Invalid time format: minutes and seconds must be less than 60');
  }
};

const convertTimeComponentsToMs = (components: TimeComponents): number => {
  return (components.hours * 3600 + components.minutes * 60 + components.seconds) * 1000;
};
