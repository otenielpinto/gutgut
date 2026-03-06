import { MongoClient } from "mongodb";

let client = null;
var dateStarted = null;

async function connect() {
  if (!client) client = new MongoClient(process.env.MONGO_CONNECTION);
  await client.connect();
  return client.db(process.env.MONGO_DATABASE);
}

async function disconnect() {
  if (!client) return true;
  try {
    await client.close();
    client = null;
  } catch (error) {
    client = null;
    return true;
  }
  return true;
}

async function close() {
  let date = new Date();
  if (dateStarted == null) {
    dateStarted = date.getDate();
    return true;
  } else {
    if (date.getDate() != dateStarted) {
      console.log("Efetuando desconexão mongoDB");
      dateStarted = null;
      await disconnect();
      global.processandoNow = 0;
      return true;
    }
  }
}

async function newConnection() {
  //tem que fechar a conexão , depois de usar
  let localclient = new MongoClient(process.env.MONGO_CONNECTION);
  await localclient.connect();
  return localclient.db(process.env.MONGO_DATABASE);
}

/**
 * Garante que os índices críticos existam no banco.
 * Deve ser chamado uma vez durante a inicialização da aplicação.
 * O índice único em tmp_pedido_venda.id previne pedidos duplicados
 * mesmo em cenários de execução concorrente.
 */
async function ensureIndexes() {
  try {
    const db = await connect();
    await db
      .collection("tmp_pedido_venda")
      .createIndex({ id: 1 }, { unique: true, name: "idx_unique_pedido_id" });
    console.log("[ensureIndexes] Índice único tmp_pedido_venda.id garantido.");
  } catch (error) {
    console.log(`[ensureIndexes] Erro ao criar índices: ${error.message}`);
  }
}

export const TMongo = {
  connect,
  disconnect,
  newConnection,
  close,
  ensureIndexes,
};
