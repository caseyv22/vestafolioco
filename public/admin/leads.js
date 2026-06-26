/* /admin/leads.css — leads table, filters, badges, lead detail */

/* ── Filters ──────────────────────────────────────────────── */

.leads__filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

@media (min-width: 768px) {
  .leads__filters {
    flex-direction: row;
    align-items: center;
    gap: var(--space-5);
  }
}

.leads__search-wrap {
  flex-shrink: 0;
}

.leads__search {
  font-family: var(--font-sans);
  font-size: var(--text-body-sm);
  color: var(--color-forest);
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--color-sage) 40%, transparent);
  padding: var(--space-2) 0;
  width: 260px;
  outline: none;
  transition: border-color var(--transition-hover);
  -webkit-appearance: none;
}

.leads__search:focus {
  border-bottom-color: var(--color-gold);
}

.leads__search::placeholder {
  color: color-mix(in srgb, var(--color-sage) 60%, transparent);
}

.leads__status-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.leads__filter {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--tracking-micro);
  text-transform: uppercase;
  color: var(--color-sage);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--color-sage) 30%, transparent);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition: all var(--transition-hover);
  border-radius: 2px;
}

.leads__filter:hover {
  border-color: var(--color-gold);
  color: var(--color-forest);
}

.leads__filter--active {
  background-color: var(--color-forest);
  border-color: var(--color-forest);
  color: var(--color-cream);
}

/* ── Table ────────────────────────────────────────────────── */

.leads__table .projects__td--title {
  min-width: 180px;
}

.leads__row {
  cursor: pointer;
}

/* ── Pagination ───────────────────────────────────────────── */

.leads__pagination {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid color-mix(in srgb, var(--color-sage) 20%, transparent);
}

.leads__page-info {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  color: var(--color-sage);
}

/* ── Lead detail ──────────────────────────────────────────── */

.lead__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
}

.lead__header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
}

.lead__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
}

@media (min-width: 900px) {
  .lead__grid {
    grid-template-columns: 1fr 320px;
    align-items: start;
  }
}

.lead__dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.lead__dl-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: var(--space-3);
  align-items: baseline;
}

.lead__dl-row dt {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--tracking-micro);
  text-transform: uppercase;
  color: var(--color-sage);
}

.lead__dl-row dd {
  font-family: var(--font-sans);
  font-size: var(--text-body-sm);
  color: var(--color-forest);
  margin: 0;
}

.lead__dl-row dd a {
  color: var(--color-forest);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.lead__sidebar-section {
  position: sticky;
  top: var(--space-6);
}

.lead__status-select {
  width: 100%;
  min-width: 0;
  margin-top: var(--space-2);
}

/* Lead detail — section heading spacing */
.lead__details .project-edit__section-heading {
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid color-mix(in srgb, var(--color-sage) 15%, transparent);
}

.lead__details .project-edit__section {
  padding-top: var(--space-5);
  padding-bottom: var(--space-5);
}
