export function buildPagination(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  return {
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}
