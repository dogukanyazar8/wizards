import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";

/**
 * Rota seviyesindeki yükleme — yalnız **ızgara çerçevesi** (`05-faz4` §1).
 *
 * Kart iskeletleri kartların kendi içindedir: altı sorgu ayrı ayrı yüklenir ve biri geciktiğinde
 * diğerleri beklemez. Burada tek bir tam ekran iskelet çizmek o bağımsızlığı görünmez kılardı.
 */
export default function HomeLoading() {
  const { grid } = HOME_METRICS;

  return (
    <div
      aria-hidden="true"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="home-loading"
      style={{
        padding: `${pxToRem(HOME_METRICS.topBar.paddingTop)} ${pxToRem(
          grid.paddingX,
        )} ${pxToRem(grid.paddingBottom)}`,
      }}
    />
  );
}
