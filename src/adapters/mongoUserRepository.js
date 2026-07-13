/**
 * users collection owned by auth-service (separate database from the CMS).
 *
 * @implements {import('../ports/ports.js').UserRepository}
 */
export default class MongoUserRepository {
    /**
     * @param {import('mongodb').Collection} collection
     */
    constructor(collection) {
        this._collection = collection;
    }

    async ensureIndexes() {
        await this._collection.createIndex({ user_id: 1 }, { unique: true });
    }

    /** @param {import('../ports/ports.js').IdentityProfile} profile */
    async upsertFromProfile(profile) {
        const kerberos = (profile.user_id || profile.email.split('@')[0] || '').toLowerCase();
        const now = new Date();
        const { value } = await this._collection.findOneAndUpdate(
            { user_id: profile.user_id },
            {
                $set: {
                    email: profile.email,
                    name: profile.name,
                    kerberos,
                    uniqueiitdid: profile.unique_id,
                    category: profile.category,
                    department: profile.department,
                    last_login_at: now
                },
                $setOnInsert: { user_id: profile.user_id, created_at: now }
            },
            { upsert: true, returnDocument: 'after', includeResultMetadata: true }
        );
        return value;
    }

    async findByUserId(userId) {
        return this._collection.findOne({ user_id: userId });
    }
}
