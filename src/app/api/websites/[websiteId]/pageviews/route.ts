import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';
import { getCompareDate } from '@/lib/date';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewWebsite } from '@/permissions';
import { getPageviewStats, getSessionStats } from '@/queries/sql';

function convertSeriesToTimezone<T extends { x: string | Date; y: number; [key: string]: any }>(
  data: T[],
  timezone: string,
) {
  if (!timezone || !data) {
    return data;
  }

  return data.map(item => {
    try {
      const raw = item.x;
      const date =
        typeof raw === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
          ? new Date(`${raw.replace(' ', 'T')}Z`)
          : new Date(raw);

      const formatted = formatInTimeZone(date, timezone, 'yyyy-MM-dd HH:mm:ss');

      return {
        ...item,
        x: formatted,
      };
    } catch {
      return item;
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...filterParams,
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  const [rawPageviews, rawSessions] = await Promise.all([
    getPageviewStats(websiteId, filters),
    getSessionStats(websiteId, filters),
  ]);

  const timezone = (filters as any).timezone || 'Asia/Phnom_Penh';

  const pageviews = convertSeriesToTimezone(rawPageviews, timezone);
  const sessions = convertSeriesToTimezone(rawSessions, timezone);

  if (filters.compare) {
    const { startDate: compareStartDate, endDate: compareEndDate } = getCompareDate(
      filters.compare,
      filters.startDate,
      filters.endDate,
    );

    const [rawComparePageviews, rawCompareSessions] = await Promise.all([
      getPageviewStats(websiteId, {
        ...filters,
        startDate: compareStartDate,
        endDate: compareEndDate,
      }),
      getSessionStats(websiteId, {
        ...filters,
        startDate: compareStartDate,
        endDate: compareEndDate,
      }),
    ]);

    const comparePageviews = convertSeriesToTimezone(rawComparePageviews, timezone);
    const compareSessions = convertSeriesToTimezone(rawCompareSessions, timezone);

    return json({
      pageviews,
      sessions,
      startDate: filters.startDate,
      endDate: filters.endDate,
      compare: {
        pageviews: comparePageviews,
        sessions: compareSessions,
        startDate: compareStartDate,
        endDate: compareEndDate,
      },
    });
  }

  return json({ pageviews, sessions });
}
