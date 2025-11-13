import { TMongo } from "../infra/mongoClient.js";

/**
 * Base class for repositories that automatically connects to MongoDB
 * through TMongo and provides basic CRUD methods
 */
class Repository {
  constructor(collectionName, id_tenant = null) {
    this.collectionName = collectionName;
    this.id_tenant = id_tenant ? Number(id_tenant) : null;
    this._db = null;
  }

  /**
   * Automatically connects to MongoDB if not already connected
   */
  async getDb() {
    if (!this._db) {
      this._db = await TMongo.connect();
    }
    return this._db;
  }

  /**
   * Returns the MongoDB collection
   */
  async getCollection() {
    const db = await this.getDb();
    return db.collection(this.collectionName);
  }

  /**
   * Automatically adds id_tenant to payload if provided
   */
  _addTenantFilter(payload = {}) {
    if (this.id_tenant !== null && !payload.id_tenant) {
      payload.id_tenant = this.id_tenant;
    }
    return payload;
  }

  /**
   * Adds tenant filter for queries
   */
  _addTenantToQuery(query = {}) {
    if (this.id_tenant !== null) {
      query.id_tenant = this.id_tenant;
    }
    return query;
  }

  async create(payload) {
    const collection = await this.getCollection();
    const data = this._addTenantFilter({ ...payload });

    if (!data.created_at) {
      data.created_at = new Date();
    }

    if (data?.empresa) {
      data.id_empresa = data.empresa;
    }

    if (!data.id_empresa) {
      data.id_empresa = 1;
    }
    const result = await collection.insertOne(data);
    return result.insertedId;
  }

  async update(id, payload) {
    const collection = await this.getCollection();
    const data = this._addTenantFilter({ ...payload });

    data.updated_at = new Date();

    if (data?.empresa) {
      data.id_empresa = data.empresa;
    }

    if (!data.id_empresa) {
      data.id_empresa = 1;
    }

    let filter = { id: id };
    filter = this._addTenantToQuery(filter);

    const result = await collection.updateOne(
      filter,
      { $set: data },
      { upsert: true }
    );
    return result;
  }

  async delete(id) {
    const collection = await this.getCollection();

    let filter = { id: id };
    filter = this._addTenantToQuery(filter);

    const result = await collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  async findAll(criteria = {}) {
    const collection = await this.getCollection();
    const query = this._addTenantToQuery(criteria);
    return await collection.find(query).toArray();
  }

  async findById(id) {
    const collection = await this.getCollection();

    let filter = { id: id };
    filter = this._addTenantToQuery(filter);

    return await collection.findOne(filter);
  }

  async findOne(criteria = {}) {
    const collection = await this.getCollection();
    const query = this._addTenantToQuery(criteria);
    return await collection.findOne(query);
  }

  async insertMany(items) {
    if (!Array.isArray(items) || items.length === 0) return null;

    const collection = await this.getCollection();
    const data = items.map((item) => this._addTenantFilter({ ...item }));

    try {
      return await collection.insertMany(data);
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  async deleteMany(criteria = {}) {
    const collection = await this.getCollection();
    const query = this._addTenantToQuery(criteria);

    try {
      return await collection.deleteMany(query);
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  async updateMany(query = {}, fields = {}) {
    const collection = await this.getCollection();
    const queryWithTenant = this._addTenantToQuery(query);
    const data = this._addTenantFilter(fields);

    data.updated_at = new Date();

    try {
      return await collection.updateMany(queryWithTenant, { $set: data });
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  /**
   * Counts documents in the collection
   */
  async count(criteria = {}) {
    const collection = await this.getCollection();
    const query = this._addTenantToQuery(criteria);
    return await collection.countDocuments(query);
  }

  /**
   * Executes custom aggregation
   */
  async aggregate(pipeline = []) {
    const collection = await this.getCollection();

    // Add tenant filter at the beginning of pipeline if necessary
    if (this.id_tenant !== null) {
      pipeline.unshift({ $match: { id_tenant: this.id_tenant } });
    }

    return await collection.aggregate(pipeline).toArray();
  }
}

export { Repository };
