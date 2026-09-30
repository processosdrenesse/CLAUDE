import { createRootRoute, createRoute, createRouter, Outlet, redirect, useParams } from "@tanstack/react-router";
import { Shell } from "@/components/layout/Shell";
import { AREA_KEYS, type AreaKey } from "@/config/areas";
import Agendamentos from "@/pages/Agendamentos";
import FaturamentoComercial from "@/pages/FaturamentoComercial";
import Parcerias from "@/pages/Parcerias";
import { FaturamentoLever, Funil, QualidadeCrm } from "@/pages/LeverPages";

const root = createRootRoute({ component: () => <Shell><Outlet /></Shell> });
const route = (path: string, component: () => React.ReactNode) => createRoute({ getParentRoute: () => root, path, component });

const areaOf = (): AreaKey => {
  const { area } = useParams({ strict: false }) as { area: string };
  return (AREA_KEYS.includes(area as AreaKey) ? area : "sdr") as AreaKey;
};
// `key` reinicia os filtros ao trocar de área
const FunilPage = () => { const a = areaOf(); return <Funil key={a} area={a} />; };
const FatPage = () => { const a = areaOf(); return <FaturamentoLever key={a} area={a} />; };
const QualPage = () => { const a = areaOf(); return <QualidadeCrm key={a} area={a} />; };

const tree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: "/", beforeLoad: () => { throw redirect({ to: "/agendamentos" }); } }),
  route("/agendamentos", Agendamentos), route("/faturamento-comercial", FaturamentoComercial),
  route("/funil/$area", FunilPage), route("/faturamento/$area", FatPage), route("/qualidade/$area", QualPage), route("/parcerias", Parcerias),
]);
export const router = createRouter({ routeTree: tree });
declare module "@tanstack/react-router" { interface Register { router: typeof router } }
