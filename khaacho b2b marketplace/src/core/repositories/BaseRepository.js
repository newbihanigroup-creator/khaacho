const { DatabaseError } = require('../../shared/errors');
const logger = require('../../shared/logger');

/**
 * Base Repository Class
 * Provides common database operations
 * All repositories should extend this class
 */
class BaseRepository {
  constructor(prisma, modelName) {
    this.prisma = prisma;
    this.modelName = modelName;
    this.model = prisma[modelName];
  }

  /**
   * Find by ID
   */
  async findById(id, include = {}) {
    try {
      return await this.model.findUnique({
        where: { id },
        include,
      });
    } catch (error) {
      logger.error(`${this.modelName} findById error`, { id, error: error.message });
      throw new DatabaseError(`Failed to find ${this.modelName} by ID`, { id });
    }
  }

  /**
   * Find one by criteria
   */
  async findOne(where, include = {}) {
    try {
      return await this.model.findFirst({
        where,
        include,
      });
    } catch (error) {
      logger.error(`${this.modelName} findOne error`, { where, error: error.message });
      throw new DatabaseError(`Failed to find ${this.modelName}`, { where });
    }
  }

  /**
   * Find many with pagination
   */
  async findMany(options = {}) {
    const {
      where = {},
      include = {},
      orderBy = { createdAt: 'desc' },
      skip = 0,
      take = 20,
    } = options;

    try {
      const [items, total] = await Promise.all([
        this.model.findMany({
          where,
          include,
          orderBy,
          skip,
          take,
        }),
        this.model.count({ where }),
      ]);

      return { items, total };
    } catch (error) {
      logger.error(`${this.modelName} findMany error`, { options, error: error.message });
      throw new DatabaseError(`Failed to find ${this.modelName} records`, { options });
    }
  }

  /**
   * Create record
   */
  async create(data, include = {}) {
    try {
      return await this.model.create({
        data,
        include,
      });
    } catch (error) {
      logger.error(`${this.modelName} create error`, { error: error.message });
      throw new DatabaseError(`Failed to create ${this.modelName}`, { error: error.message });
    }
  }

  /**
   * Update record
   */
  async update(id, data, include = {}) {
    try {
      return await this.model.update({
        where: { id },
        data,
        include,
      });
    } catch (error) {
      logger.error(`${this.modelName} update error`, { id, error: error.message });
      throw new DatabaseError(`Failed to update ${this.modelName}`, { id });
    }
  }

  /**
   * Delete record
   */
  async delete(id) {
    try {
      return await this.model.delete({
        where: { id },
      });
    } catch (error) {
      logger.error(`${this.modelName} delete error`, { id, error: error.message });
      throw new DatabaseError(`Failed to delete ${this.modelName}`, { id });
    }
  }

  /**
   * Count records
   */
  async count(where = {}) {
    try {
      return await this.model.count({ where });
    } catch (error) {
      logger.error(`${this.modelName} count error`, { where, error: error.message });
      throw new DatabaseError(`Failed to count ${this.modelName}`, { where });
    }
  }

  /**
   * Check if exists
   */
  async exists(where) {
    try {
      const count = await this.model.count({ where });
      return count > 0;
    } catch (error) {
      logger.error(`${this.modelName} exists error`, { where, error: error.message });
      throw new DatabaseError(`Failed to check ${this.modelName} existence`, { where });
    }
  }
}

module.exports = BaseRepository;
