const { handleBuiltInPlaceholderPostgres } = require('../mother/modules/databaseManager/placeholders/postgresPlaceholders');

test('PostgreSQL page search selects DISTINCT ordering columns without exposing them in the DTO', async () => {
  const client = { query: jest.fn(async (sql, params) => {
    const projection = sql.slice(sql.indexOf('SELECT DISTINCT'), sql.indexOf('FROM pagesManager.pages'));
    // Model PostgreSQL's DISTINCT/ORDER BY admission rule at the DB boundary.
    for (const column of ['p.weight', 'p.created_at']) {
      if (!projection.includes(column)) throw new Error('ORDER BY expressions must appear in select list');
    }
    expect(params).toEqual(['%docs%', 'public', 10]);
    expect(sql).toContain("($2 = 'all' OR p.lane = $2)");
    return { rows: [{ id: 24, title: 'Docs', slug: 'docs', lane: 'public', __sort_weight: 2, __sort_created_at: new Date() }] };
  }) };
  await expect(handleBuiltInPlaceholderPostgres(client, 'SEARCH_PAGES', [{ query: 'docs', lane: 'public', limit: 10 }]))
    .resolves.toEqual([{ id: 24, title: 'Docs', slug: 'docs', lane: 'public' }]);
  expect(client.query).toHaveBeenCalledTimes(1);
});
