import { Tiny, TinyInfo } from "../services/tinyService.js";
import { MpkIntegracaoNewRepository } from "../repository/mpkIntegracaoNewRepository.js";
import { PedidoVendaRepository } from "../repository/pedidoVendaRepository.js";
import { lib } from "../utils/lib.js";
import { CanalVendaRepository } from "../repository/canalVendaRepository.js";
const LIST_CANAL_VENDA = [];

const situacao_aberto = "Em aberto";
const situacao_aprovado = "Aprovado";
const situacao_preparando_envio = "Preparando envio";
const situacao_faturado = "Faturado (atendido)";
const situacao_pronto_envio = "Pronto para envio";
const situacao_enviado = "Enviado";
const situacao_entregue = "Entregue";
const situacao_nao_entregue = "Não Entregue";
const situacao_cancelado = "Cancelado";
const situacao_dados_incompletos = "Dados incompletos";

async function init() {
  await importarPedidosVendasTiny();
  await importarPedidosVendasDataAtualizacao();
}

async function criarCamposExtrasPedidoVenda(id_tenant, pedidos = []) {
  //quero adicionar um campo id_tenant em cada pedido para identificar a origem
  pedidos = pedidos.map((pedido) => {
    let dt_movto = lib.dateBrStrToDateUTCTime(pedido?.pedido?.data_pedido);
    return {
      id_tenant: id_tenant,
      dt_movto,
      ...pedido?.pedido,
    };
  });

  return pedidos;
}

async function importarPedidosVendasTiny() {
  const tenants = await new MpkIntegracaoNewRepository().findAll({
    importar_pedido: "1",
  });

  for (const tenant of tenants) {
    const tiny = new Tiny({ token: tenant?.token });
    tiny.setTimeout(30000); //30 segundos
    const tintyInfo = new TinyInfo({ instance: tiny });
    let dataInicial = await tintyInfo.getDataInicialPedidos();
    const pageCount = await tintyInfo.getPaginasPedidos(dataInicial);
    console.log(
      `Importando pedidos por data de criação a partir de ${dataInicial} - Total de paginas: ${pageCount}`
    );

    for (let page = 1; page <= pageCount; page++) {
      let data = [
        { key: "dataInicial", value: String(dataInicial) },
        { key: "pagina", value: page },
      ];

      for (let t = 0; t < 3; t++) {
        try {
          let response = await tiny.post("pedidos.pesquisa.php", data);
          let pedidos = await tiny.tratarRetorno(response, "pedidos");
          if (tiny.status() == "OK") {
            pedidos = await criarCamposExtrasPedidoVenda(
              tenant.id_tenant,
              pedidos
            );
            try {
              await salvarPedidosVenda({ pedidosVendas: pedidos, tiny });
            } catch (error) {
              console.log(`Erro ao salvar pedidos: ${error.message}`);
            }

            break;
          }
        } catch (error) {
          console.log(
            `Erro ao buscar pedidos na pagina ${page}. Tentativa ${
              t + 1
            } de 3. Erro: ${error.message}`
          );
          if (t == 2) {
            console.log(
              `Falha ao buscar pedidos na pagina ${page} apos 3 tentativas. Pulando para a proxima pagina.`
            );
          } else {
            await lib.sleep(10000); //espera 10 segundos antes de tentar novamente
          }
        }
      }

      await lib.sleep(1000 * 5); //para nao estourar o limite de requisicoes
    }
  }
}

async function importarPedidosVendasDataAtualizacao() {
  const tenants = await new MpkIntegracaoNewRepository().findAll({
    importar_pedido: "1",
  });

  for (const tenant of tenants) {
    const tiny = new Tiny({ token: tenant?.token });
    tiny.setTimeout(30000); //30 segundos
    const tintyInfo = new TinyInfo({ instance: tiny });
    let dataInicial = lib.formatDateBr(new Date());
    const pageCount = await tintyInfo.getPaginasPedidosDataAtualizacao(
      dataInicial
    );

    console.log(
      `Importando pedidos por data de atualização a partir de ${dataInicial} - Total de paginas: ${pageCount}`
    );

    if (!pageCount || pageCount === 0) {
      console.log("Nenhum pedido para importar na data de atualização.");
      continue;
    }

    for (let page = 1; page <= pageCount; page++) {
      let data = [
        { key: "dataAtualizacao", value: String(dataInicial) },
        { key: "pagina", value: page },
      ];

      for (let t = 0; t < 3; t++) {
        try {
          let response = await tiny.post("pedidos.pesquisa.php", data);
          let pedidos = await tiny.tratarRetorno(response, "pedidos");
          if (tiny.status() == "OK") {
            pedidos = await criarCamposExtrasPedidoVenda(
              tenant.id_tenant,
              pedidos
            );
            await salvarPedidosVenda({ pedidosVendas: pedidos, tiny });
            break;
          }
        } catch (error) {
          console.log(
            `Erro ao buscar pedidos na pagina ${page}. Tentativa ${
              t + 1
            } de 3. Erro: ${error.message}`
          );
          if (t == 2) {
            console.log(
              `Falha ao buscar pedidos na pagina ${page} apos 3 tentativas. Pulando para a proxima pagina.`
            );
          } else {
            await lib.sleep(10000); //espera 10 segundos antes de tentar novamente
          }
        }
      }
      await lib.sleep(1000 * 10); //para nao estourar o limite de requisicoes
    }
  }
}

async function addEcommerce({ nome_ecommerce = "", id_tenant = 0 } = {}) {
  if (!nome_ecommerce || nome_ecommerce.trim() === "") {
    return null;
  }

  if (!LIST_CANAL_VENDA.includes(nome_ecommerce)) {
    LIST_CANAL_VENDA.push(nome_ecommerce);

    console.log(`Canal de venda adicionado: ${nome_ecommerce}`);
    const rep = new CanalVendaRepository(id_tenant);

    const exists = await rep.findOne({ nome: nome_ecommerce });
    if (exists) {
      return null;
    }

    const obj = {
      id: lib.newUUId(),
      nome: nome_ecommerce,
      id_tenant: id_tenant,
      id_empresa: id_tenant,
    };
    await rep.create(obj.id, obj);
    return obj;
  }
  return null;
}

/**
 * Salva os pedidos de venda no banco de dados ( Tem que vir desustrurado do Tiny )
 *
 * @param {*} pedidosVendas
 * @returns
 *
 */

async function salvarPedidosVenda({ pedidosVendas = [], tiny = null } = {}) {
  //validar se é um array
  if (!Array.isArray(pedidosVendas)) {
    console.log("Nenhum pedido de venda para salvar.");
    return;
  }
  const repository = new PedidoVendaRepository();

  for (const pedidoVenda of pedidosVendas) {
    let situacao = pedidoVenda?.situacao || "";
    let numero = pedidoVenda?.numero || "";
    let numero_ecommerce = pedidoVenda?.numero_ecommerce || "";
    let nome_ecommerce = pedidoVenda?.ecommerce?.nomeEcommerce || "";
    let id_tenant = pedidoVenda?.id_tenant || 0;
    try {
      await addEcommerce(nome_ecommerce, id_tenant);
    } catch (error) {}

    if (!numero_ecommerce || numero_ecommerce.trim() === "") {
      console.log(
        `Pedido sem número de ecommerce. Ignorando pedido. Pedido Número: ${numero}`
      );
      continue;
    }

    //Critério para importar pedido  para shopee
    if (
      situacao == situacao_dados_incompletos ||
      situacao == situacao_cancelado
    ) {
      //Shopee só libera os dados completos apos o pagamento ser realizado no Shopee
      console.log(
        `Situação do pedido não permite importação .${numero} ${situacao} ==>Sit.Atual:${situacao}`
      );

      /**
       * se o pedido já existir no banco, devo atualizar o status para cancelado
       * devo cancelar os produtos que foram reservados para esse pedido
       */

      await repository.update(pedidoVenda?.id, {
        situacao: 2,
        situacao: situacao,
      });
      //falta cancelar os produtos reservados para esse pedido

      continue;
    }

    const exists = await repository.findById(pedidoVenda?.id);
    if (exists) {
      continue;
    }

    if (exists) {
      //atualizar
      //await repository.update(pedidoVenda?.id, pedidoVenda);
    } else {
      await lib.sleep(1000 * 3); //para nao estourar o limite de requisicoes
      //inserir
      let response = await tiny.post("pedido.obter.php", [
        { key: "id", value: pedidoVenda?.id },
      ]);
      if (tiny.status() == "OK") {
        let pedido = await tiny.tratarRetorno(response, "pedido");
        pedido = { ...pedidoVenda, ...pedido };
        await repository.create({
          ...pedido,
          status: 1,
          sub_status: 0,
          obs_logistica: "",
        });
      }
    }
  }
}

const PedidoVendaController = {
  init,
  importarPedidosVendasTiny,
  salvarPedidosVenda,
};

export { PedidoVendaController };
