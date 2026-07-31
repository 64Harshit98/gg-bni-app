export const dashboardKeys = {
  all: ['dashboard'] as const,
  range: (
    companyId: string | undefined,
    startDate: string | undefined,
    endDate: string | undefined,
  ) =>
    [
      ...dashboardKeys.all,
      companyId ?? 'anonymous',
      startDate ?? '',
      endDate ?? '',
    ] as const,
};
