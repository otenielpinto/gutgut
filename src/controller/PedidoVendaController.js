import { Tiny, TinyInfo } from "../services/tinyService.js";
import { MpkIntegracaoNewRepository } from "../repository/mpkIntegracaoNewRepository.js";
import { PedidoVendaRepository } from "../repository/pedidoVendaRepository.js";
import { lib } from "../utils/lib.js";
import { CanalVendaRepository } from "../repository/canalVendaRepository.js";
import { PedidoDistribuirRepository } from "../repository/pedidoDistribuirRepository.js";
import { systemService } from "../services/systemService.js";
let LIST_CANAL_VENDA = [];
let PEDIDOS_PARA_REMOVER = [];

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
  await limparPedidosDistribuirAntigos();
  await limparPedidosEntregues();
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

async function addEcommerce({ nome_ecommerce, id_tenant } = {}) {
  console.log("nome do ecommerce-->", nome_ecommerce);
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
      id: await lib.newUUId(),
      nome: nome_ecommerce,
      id_tenant: id_tenant,
      id_empresa: id_tenant,
    };
    await rep.create(obj);
    return obj;
  }
  return null;
}

/**
 * Limpa pedidos distribuir com updated_at superior a 3 dias
 * Executa apenas uma vez por dia usando systemService.started()
 *
 * @returns {Promise<void>}
 */
async function limparPedidosDistribuirAntigos() {
  const tenants = await new MpkIntegracaoNewRepository().findAll({
    importar_pedido: "1",
  });

  for (const tenant of tenants) {
    const key = `limpar_pedidos_distribuir_${tenant.id_tenant}`;

    if ((await systemService.started(tenant.id_tenant, key)) == 1) {
      console.log(
        `Limpeza de pedidos distribuir já realizada para o tenant ${tenant.id_tenant}`
      );
      continue;
    }

    try {
      // Calcula data limite (hoje - 3 dias)
      const dataLimite = new Date(lib.addDays(new Date(), -3));

      const pedidoDistribuir = new PedidoDistribuirRepository(tenant.id_tenant);

      // Deleta registros com updated_at anterior a 3 dias
      const resultado = await pedidoDistribuir.deleteMany({
        updated_at: { $lt: dataLimite },
      });

      console.log(
        `Pedidos distribuir antigos removidos para tenant ${
          tenant.id_tenant
        }: ${resultado?.deletedCount || 0} registros`
      );
    } catch (error) {
      console.log(
        `Erro ao limpar pedidos distribuir antigos para tenant ${tenant.id_tenant}: ${error.message}`
      );
    }
  }
}

/**
 * Adiciona pedido à lista de controle se não existir
 * Mantém lista com máximo de 1000 registros
 *
 * @param {string} situacao - Situação do pedido
 * @param {string} id_pedido - ID do pedido
 * @returns {Promise<void>}
 */
async function adicionarPedidoParaRemocao({ situacao, id_pedido }) {
  // Verifica se situação é válida
  const situacoesValidas = [
    situacao_pronto_envio,
    situacao_enviado,
    situacao_entregue,
  ];

  if (!situacoesValidas.includes(situacao)) {
    console.log(
      `Situação ${situacao} não permitida para o pedido ${id_pedido}`
    );
    return;
  }

  // Verifica se pedido já existe na lista
  if (PEDIDOS_PARA_REMOVER.includes(id_pedido)) {
    return;
  }

  // Adiciona novo pedido
  PEDIDOS_PARA_REMOVER.push(id_pedido);
  console.log(
    `Pedido ${id_pedido} (${situacao}) adicionado para remoção futura`
  );

  // Limita lista a 1000 registros
  if (PEDIDOS_PARA_REMOVER.length > 1000) {
    const removido = PEDIDOS_PARA_REMOVER.shift();
    console.log(
      `Lista de pedidos cheia - Removido pedido mais antigo: ${removido}`
    );
  }
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
  const pedidoDistribuir = new PedidoDistribuirRepository();

  for (const pedidoVenda of pedidosVendas) {
    let situacao = pedidoVenda?.situacao || "";
    let numero = pedidoVenda?.numero || "";
    let numero_ecommerce = pedidoVenda?.numero_ecommerce || "";

    if (!numero_ecommerce || numero_ecommerce.trim() === "") {
      console.log(
        `Pedido sem número de ecommerce. Ignorando pedido. Pedido Número: ${numero}`
      );
      continue;
    }
    console.log(situacao, numero, numero_ecommerce);
    //Critério para importar pedido  para shopee
    if (
      situacao == situacao_dados_incompletos ||
      situacao == situacao_cancelado
    ) {
      if (situacao == situacao_dados_incompletos) {
        console.log(
          `Pedido ${numero} com situação de dados incompletos. Ignorando importação.`
        );
        continue;
      }

      //Shopee só libera os dados completos apos o pagamento ser realizado no Shopee
      console.log(
        `Situação do pedido não permite importação .${numero} ${situacao} ==>Sit.Atual:${situacao}`
      );

      /**
       * se o pedido já existir no banco, devo atualizar o status para cancelado
       * devo cancelar os produtos que foram reservados para esse pedido
       */

      const exists = await repository.findById(pedidoVenda?.id);
      if (exists) {
        try {
          await repository.delete(pedidoVenda?.id);
        } finally {
          console.log(
            "Deletando produtos reservados para o pedido cancelado:",
            pedidoVenda?.id
          );
          await pedidoDistribuir.deleteMany({ id_pedido: pedidoVenda?.id });
        }
      }

      continue;
    }

    const exists = await repository.findById(pedidoVenda?.id);
    if (exists) {
      await adicionarPedidoParaRemocao({
        situacao,
        id_pedido: pedidoVenda?.id,
      });
      continue;
    }

    await lib.sleep(1000 * 3); //para nao estourar o limite de requisicoes
    //**************************************************** */
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

      //cadastrar o nome do ecommerce na tabela de canal de vendas
      try {
        await addEcommerce({
          nome_ecommerce: pedido?.ecommerce?.nomeEcommerce || "",
          id_tenant: pedido?.id_tenant || 0,
        });
      } catch (error) {
        console.log(`Erro ao adicionar canal de venda: ${error.message}`);
      }
    }
    //**************************************************** */
  }
}

/**
 * Limpa pedidos entregues (pronto para envio, enviado ou entregue) e,
 * além disso, remove da collection `pedido_distribuir` os pedidos que
 * foram marcados na lista global `PEDIDOS_PARA_REMOVER`.
 *
 * Executa apenas uma vez por dia usando systemService.started()
 *
 * @returns {Promise<void>}
 */
async function limparPedidosEntregues() {
  if (
    !Array.isArray(PEDIDOS_PARA_REMOVER) ||
    PEDIDOS_PARA_REMOVER.length === 0
  ) {
    console.log("Nenhum pedido para limpar.");
    return;
  }

  const tenants = await new MpkIntegracaoNewRepository().findAll({
    importar_pedido: "1",
  });

  for (const tenant of tenants) {
    const key = `limpar_pedidos_entregues_${tenant.id_tenant}`;

    // -------------------------------------------------------------
    // 1️⃣  Verifica se a limpeza já foi feita hoje para este tenant
    // -------------------------------------------------------------
    if ((await systemService.started(tenant.id_tenant, key)) == 1) {
      console.log(
        `Limpeza de pedidos entregues já realizada para o tenant ${tenant.id_tenant}`
      );
      continue;
    }

    try {
      // -------------------------------------------------------------
      // 3️⃣  Se houver itens na lista de remoção, exclui da collection
      //     `pedido_distribuir`
      // -------------------------------------------------------------
      if (
        Array.isArray(PEDIDOS_PARA_REMOVER) &&
        PEDIDOS_PARA_REMOVER.length > 0
      ) {
        const pedidoDistribuir = new PedidoDistribuirRepository(
          tenant.id_tenant
        );

        // O Mongo aceita o operador `$in` para remover vários documentos de uma vez
        const distribResult = await pedidoDistribuir.deleteMany({
          id_pedido: { $in: PEDIDOS_PARA_REMOVER },
        });

        console.log(
          `Pedidos distribuídos removidos (lista de remoção) para tenant ${
            tenant.id_tenant
          }: ${distribResult?.deletedCount || 0} registros`
        );

        // Opcional: limpar a lista global para a próxima execução.
        // Caso queira manter os IDs que **não** foram deletados, troque por:
        //   PEDIDOS_PARA_REMOVER = PEDIDOS_PARA_REMOVER.filter(
        //     id => !distribResult?.deletedIds?.includes(id)
        //   );
        PEDIDOS_PARA_REMOVER = [];
      } else {
        console.log(
          `Nenhum pedido em PEDIDOS_PARA_REMOVER para o tenant ${tenant.id_tenant}.`
        );
      }
    } catch (error) {
      console.log(
        `Erro ao limpar pedidos entregues para o tenant ${tenant.id_tenant}: ${error.message}`
      );
    }
  }
}

const PedidoVendaController = {
  init,
  importarPedidosVendasTiny,
  salvarPedidosVenda,
  limparPedidosDistribuirAntigos,
  limparPedidosEntregues,
  adicionarPedidoParaRemocao,
};

export { PedidoVendaController };
