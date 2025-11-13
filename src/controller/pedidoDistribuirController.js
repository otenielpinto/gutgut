import { PedidoDistribuirService } from "../services/pedidoDistribuirService.js";

async function init() {
  const pedidoDistribuirService = new PedidoDistribuirService();
  //await pedidoDistribuirService.distribuirPedidosPendentes();
  await pedidoDistribuirService.processarPedidosPendentes();
}

const PedidoDistribuirController = {
  init,
};

export { PedidoDistribuirController };
