import { TMongo } from "./infra/mongoClient.js";
import { lib } from "./utils/lib.js";
import { AnuncioController } from "./controller/anuncioController.js";
import { transferenciaController } from "./controller/transferenciaController.js";
import { devolucaoController } from "./controller/devolucaoController.js";
import { produtoSemCodigoController } from "./controller/produtoSemCodigoController.js";
import { PedidoVendaController } from "./controller/PedidoVendaController.js";
import { PedidoDistribuirController } from "./controller/pedidoDistribuirController.js";
import nodeSchedule from "node-schedule";

global.processandoNow = 0;

async function task() {
  global.processandoNow = 1;
  //colocar aqui controller;
  await TMongo.close();
  await AnuncioController.init();
  await transferenciaController.init();
  await devolucaoController.init();
  await produtoSemCodigoController.init();

  global.processandoNow = 0;
  console.log(" Job finished - task " + lib.currentDateTimeStr());
  console.log("*".repeat(60));
}

async function init() {
  //Espaço reserva para testes ;
  global.config_debug = 0; // 1 - debug | 0 - producao

  //await AnuncioController.init();
  //await transferenciaController.init();
  //await devolucaoController.init();
  //await produtoSemCodigoController.init();
  //await AnuncioController.importarProdutoTinyMensal();
  //await PedidoVendaController.init();
  //await PedidoDistribuirController.init();
  //console.log("Concluido " + lib.currentDateTimeStr());
  //return;

  try {
    let time = process.env.CRON_JOB_TIME || 15; //tempo em minutos
    const job = nodeSchedule.scheduleJob(`*/${time} * * * *`, async () => {
      if (global.processandoNow == 1) {
        console.log(
          " Job can't started [processing] " + lib.currentDateTimeStr()
        );
        return;
      }

      try {
        console.log(" Job start as " + lib.currentDateTimeStr());
        await task();
      } finally {
        global.processandoNow = 0;
      }
    });
  } catch (error) {
    throw new Error(`Can't start agenda! Err: ${error.message}`);
  }

  try {
    const timePedido = 6; //tempo em minutos
    jobPedido = nodeSchedule.scheduleJob(
      `*/${timePedido} * * * *`,
      async () => {
        if (global.hasPedido == 1) {
          return;
        }

        global.hasPedido = 1;
        try {
          await PedidoVendaController.init();
        } finally {
          await PedidoDistribuirController.init();
          global.hasPedido = 0;
        }
      }
    );
  } catch (error) {
    throw new Error(`Can't start Pedido Venda! Err: ${error.message}`);
  }
}

export const agenda = { init };
