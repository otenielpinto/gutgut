import { TMongo } from "../infra/mongoClient.js";
import { MpkIntegracaoRepository } from "../repository/mpkIntegracaoRepository.js";
import { lib } from "../utils/lib.js";

const mpkIntegracaoModel = {
  id: 0,
  descricao: "Api Tiny",
  id_mktplace: 0,
  base_url: "",
  client_id: "",
  client_secret: "",
  app_key: "",
  tabela_preco: "",
  sellerid: "",
  max_anuncio: "",
  id_storage: "000000",
  excluido: 0,
  codigo: null,
  token: null,
  id_tenant: 0,
};
async function init() {
  await createAllIntegracao();
}
async function createAllIntegracao() {
  const repository = new MpkIntegracaoRepository(await TMongo.connect());

  for (let i = 1; i < 9; i++) {
    let body = mpkIntegracaoModel;
    body.id = i;
    body.descricao = "Integracao " + i;
    body.id_mktplace = 8;
    body.token = String(i);
    body.codigo = await lib.newUUId();
    body.id_tenant = i;
    console.log(body);
    await repository.create(body);
  }
}

const Seed = {
  init,
};

export { Seed };
