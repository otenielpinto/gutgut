import { getIdStorage } from "../controller/mpkIntegracaoController.js";

async function listOfVariations(variations, preco, preco_promocional) {
  if (!variations) return [];
  let variacoes = [];

  for (let v of variations) {
    let obj = {
      variacao: {
        codigo: String(v.id_produto),
        preco: String(preco),
        preco_promocional: String(preco_promocional),
        estoque_atual: v.estoque || 0,
        grade: {
          Tamanho: v.tamanho,
          Cor: v.nome_cor,
        },
      },
    };

    if (v?.id_variant_mktplace) {
      obj.variacao.id = v.id_variant_mktplace;
    }

    variacoes.push(obj);
  }
  return variacoes;
}

async function toTiny(payload) {
  let new_codigo = "X" + payload.sku;
  let id_storage = await getIdStorage(payload);
  //criar opcao para enviar ou nao a cor na descricao do produto

  let produto = {
    sequencia: "1",
    codigo: new_codigo,
    nome: payload?.descricao_base + " " + payload?.nome_cor,
    unidade: payload?.unidade,
    preco: payload.preco,
    ncm: payload?.ncm,
    preco_promocional: payload.preco_promocional,
    origem: "0",
    situacao: "A",
    tipo: "P",
    classe_produto: payload?.variacao > 0 ? "V" : "P",
    gtin: String(payload?.gtin),
    marca: payload?.nome_marca,
    tipo_embalagem: "2",
    altura_embalagem: String(payload.altura),
    comprimento_embalagem: String(payload.comprimento),
    largura_embalagem: String(payload.largura),
    diametro_embalagem: "00",
    garantia: "3 meses",
    cest: "",
    valor_max: "0",
    motivo_isencao: "",
    descricao_complementar: payload?.detalhes_html,
    obs: `T7Ti`,
  };

  if (payload?.id_anuncio_mktplace || payload?.id_anuncio_mktplace !== "") {
    produto.id = payload.id_anuncio_mktplace;
  }

  let variacoes = [];
  if (payload?.variacoes) {
    variacoes = await listOfVariations(
      payload.variacoes,
      payload.preco,
      payload.preco_promocional
    );
    produto.variacoes = variacoes;
  }

  let qtd_images = payload?.qtd_images || 0;
  if (qtd_images > 0) {
    let imagens_externas = [];
    let storage = `https://www.superempresarial.com.br/storage/${id_storage}/`;
    for (let i = 1; i <= qtd_images; i++) {
      let link = `${storage}${payload?.sku}-${i}.jpg`;
      let obj = { imagem_externa: { url: link } };
      imagens_externas.push(obj);
    }

    produto.imagens_externas = imagens_externas;
  }

  let obj = { produto: produto };
  return obj;
}

const ProtocoloAnuncioMapper = { toTiny, listOfVariations };
export { ProtocoloAnuncioMapper };
