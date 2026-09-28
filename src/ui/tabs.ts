export type TabId = "prepare" | "sync";

export interface TabsOptions {
  tabList: HTMLElement;
  /** Se llama cada vez que se selecciona una pestaña (incluida la inicial). */
  onChange?: (id: TabId) => void;
}

export interface TabsControls {
  select(id: TabId): void;
  getSelected(): TabId;
}

/**
 * Pestañas accesibles (patrón WAI-ARIA "tabs" con activación automática): tabindex itinerante,
 * ←/→ (y Inicio/Fin) navegan entre pestañas SOLO con el foco en una de ellas, y el panel
 * inactivo va con `hidden` — así sus controles no son enfocables. Los paneles solo se ocultan:
 * nunca se destruyen ni se re-crean, ni tampoco la región de audio (que está fuera de ellos).
 */
export function setupTabs({ tabList, onChange }: TabsOptions): TabsControls {
  const tabs = Array.from(tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  let selected: TabId = "prepare";

  const panelOf = (tab: HTMLElement): HTMLElement | null => document.getElementById(tab.getAttribute("aria-controls") ?? "");

  function select(id: TabId): void {
    selected = id;
    for (const tab of tabs) {
      const active = tab.dataset.tab === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = panelOf(tab);
      if (panel) panel.hidden = !active;
    }
    onChange?.(id);
  }

  tabList.addEventListener("click", (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (tab) select(tab.dataset.tab as TabId);
  });

  tabList.addEventListener("keydown", (event) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!current) return;

    const index = tabs.indexOf(current as HTMLButtonElement);
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    // Con el foco en una pestaña, las flechas son de la navegación entre pestañas: que no
    // lleguen a los listeners globales (ej. el nudging del refinamiento, en document).
    event.stopPropagation();
    const next = tabs[nextIndex];
    select(next.dataset.tab as TabId);
    next.focus();
  });

  return { select, getSelected: () => selected };
}
