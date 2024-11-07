//Classe tem letras maiuculoas
import { lib } from "../utils/lib.js";

const collection = "tmp_produto_tiny";

class ProdutoTinyRepository {
  constructor(db, id_tenant) {
    this.db = db;
    this.id_tenant = Number(id_tenant);
  }

  async create(payload) {
    if (!payload.id_tenant) payload.id_tenant = this.id_tenant;
    if (!payload.sys_created_at) payload.sys_created_at = new Date();
    payload.sys_saldo = 0;
    payload.sys_estoque = 0;
    const result = await this.db.collection(collection).insertOne(payload);
    return result.insertedId;
  }

  async update(id, payload) {
    if (!payload.id_tenant) payload.id_tenant = this.id_tenant;
    payload.updated_at = new Date();

    payload.sys_codigo = String(Number(lib.onlyNumber(payload?.codigo)));
    if (!payload.sys_status) payload.sys_status = 200; //sempre que for atualizar o produto no tiny, o sys_status deve ser 200
    if (!payload.sys_estoque) payload.sys_estoque = 0;

    const result = await this.db
      .collection(collection)
      .updateOne(
        { id: String(id), id_tenant: this.id_tenant },
        { $set: payload },
        { upsert: true }
      );
    return result?.modifiedCount > 0;
  }

  async updateByCodigo(codigo, payload) {
    //  { upsert: false }   -- Nao cadastrar  nada se nao encontrar

    if (!payload.id_tenant) payload.id_tenant = this.id_tenant;
    if (!payload.sys_status) payload.sys_status = 0;
    payload.updated_at = new Date();
    const result = await this.db
      .collection(collection)
      .updateMany(
        { codigo: String(codigo), id_tenant: this.id_tenant },
        { $set: payload },
        { upsert: false }
      );
    return result?.modifiedCount > 0;
  }

  //essa funcao atualiza o estoque do produto pelo codigo numerico -- existem casos que o codigo do produto no tiny é diferente do codigo do produto no estoque
  async updateBySysCodigo(codigo, payload) {
    //  { upsert: false }   -- Nao cadastrar  nada se nao encontrar

    if (!payload.id_tenant) payload.id_tenant = this.id_tenant;
    if (!payload.sys_status) payload.sys_status = 0;
    payload.updated_at = new Date();
    const result = await this.db
      .collection(collection)
      .updateMany(
        { sys_codigo: String(codigo), id_tenant: this.id_tenant },
        { $set: payload },
        { upsert: false }
      );
    return result?.modifiedCount > 0;
  }

  async delete(id) {
    const result = await this.db
      .collection(collection)
      .deleteOne({ id: String(id), id_tenant: this.id_tenant });
    return result.deletedCount > 0;
  }

  async findAll(criterio = {}) {
    return await this.db.collection(collection).find(criterio).toArray();
  }

  async findById(id) {
    return await this.db
      .collection(collection)
      .findOne({ id: String(id), id_tenant: this.id_tenant });
  }

  async findByCodigo(codigo) {
    return await this.db
      .collection(collection)
      .findOne({ codigo: String(codigo), id_tenant: this.id_tenant });
  }

  async insertMany(items) {
    if (!Array.isArray(items)) return null;
    try {
      return await this.db.collection(collection).insertMany(items);
    } catch (e) {
      console.log(e);
    }
  }

  async deleteMany(criterio = {}) {
    try {
      return await this.db.collection(collection).deleteMany(criterio);
    } catch (e) {
      console.log(e);
    }
  }
}

export { ProdutoTinyRepository };
