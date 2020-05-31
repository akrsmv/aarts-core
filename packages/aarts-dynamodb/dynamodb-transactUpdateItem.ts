'use strict'
// TODO keys (id / meta) as separate params, and a string for the update expression?
// https://github.com/aws/aws-sdk-js/blob/master/ts/dynamodb.ts
import { DynamoDB, AWSError } from 'aws-sdk'
import { AttributeValue, TransactWriteItemsInput, AttributeName, TransactWriteItemsOutput, TransactWriteItem, TransactWriteItemList } from 'aws-sdk/clients/dynamodb'
import { RefKey, DynamoItem, DomainItem  } from './BaseItemManager';
import { dynamoDbClient, DB_NAME, toAttributeMap, ensureOnlyNewKeyUpdates, versionString, refkeyitemmeta } from './DynamoDbClient';


export const transactUpdateItem = <T extends DomainItem & DynamoItem>(existingItem: T, itemUpdates: Partial<T>, __item_refkeys: RefKey<T>[]): Promise<T> =>
    new Promise((resolve, reject) => {
        const drevisionsUpdates = toAttributeMap(
            { "inc_revision": 1, "start_revision": 0 })
        const ditemUpdates: DynamoDB.AttributeMap = toAttributeMap(
            ensureOnlyNewKeyUpdates(existingItem, itemUpdates)
        )
        const dexistingItemkey = { id: { S: itemUpdates.id }, meta: { S: itemUpdates.meta } };
        const dexistingItem = toAttributeMap(existingItem)

        if (Object.keys(ditemUpdates).length === 1 && "revisions" in ditemUpdates) {
            // no new updates, only revision passed
            throw new Error(`no new updates, only revision passed for id[${existingItem.id}]`)
        }
        const updateExpr = `set #revisions = if_not_exists(#revisions, :start_revision) + :inc_revision, ${Object.keys(ditemUpdates).filter(uk => uk != "revisions").map(uk => `#${uk} = :${uk}`).join(", ")}`
        const updateExprHistory = `set ${Object.keys(ditemUpdates).filter(diu => diu in dexistingItem).map(uk => `#${uk} = :${uk}`).join(", ")}`

        //#region DEBUG msg
        process.env.DEBUG || console.log("================================================")
        process.env.DEBUG || console.log('existing item ', existingItem)
        process.env.DEBUG || console.log('itemUpdates ', itemUpdates)
        process.env.DEBUG || console.log("drevisionsUpdates ", drevisionsUpdates)
        process.env.DEBUG || console.log("ditemUpdates ", ditemUpdates)
        process.env.DEBUG || console.log("dexistingItemkey ", dexistingItemkey)
        process.env.DEBUG || console.log("updateExpr ", updateExpr)
        process.env.DEBUG || console.log("updateExprHistory ", updateExprHistory)
        process.env.DEBUG || console.log("================================================")
        //#endregion

        const itemTransactWriteItemList: TransactWriteItemList = [
            {
                Update: {
                    ConditionExpression: `#revisions = :revisions`,
                    Key: dexistingItemkey,
                    TableName: DB_NAME,
                    ExpressionAttributeNames: Object.keys(ditemUpdates).reduce<{ [key: string]: AttributeName }>((accum, key) => {
                        accum[`#${key}`] = key
                        return accum
                    }, {}),
                    ExpressionAttributeValues: Object.assign(
                        {},
                        Object.keys(ditemUpdates).reduce<{ [key: string]: AttributeValue }>((accum, key) => {
                            accum[`:${key}`] = ditemUpdates[key].S !== "__del__" ? ditemUpdates[key] : {NULL:true}
                            return accum
                        }, {}),
                        Object.keys(drevisionsUpdates).reduce<{ [key: string]: AttributeValue }>((accum, key) => {
                            accum[`:${key}`] = drevisionsUpdates[key]
                            return accum
                        }, {})
                    ),
                    UpdateExpression: updateExpr,
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                }
            },
            // { // PUT the history record
            //     Put: {
            //         TableName: DB_NAME,
            //         ReturnValuesOnConditionCheckFailure: "ALL_OLD",
            //         Item: Object.assign({
            //             id: dexistingItemkey.id,
            //             meta: { S: `${versionString(++existingItem.revisions)}|${existingItem.item_type}` },
            //         }
            //             , Object.keys(ditemUpdates).reduce<{ [key: string]: AttributeValue }>((accum, key) => {
            //                 accum[key] = dexistingItem[key]
            //                 return accum
            //             }, {})
            //         )
            //     }
            { // UPDATE the history record
                Update: {
                    TableName: DB_NAME,
                    ReturnValuesOnConditionCheckFailure: "ALL_OLD",
                    Key: Object.assign({
                        id: dexistingItemkey.id,
                        meta: { S: `${versionString(++existingItem.revisions)}|${existingItem.item_type}` },
                    }),
                    UpdateExpression: updateExprHistory,
                    ExpressionAttributeNames: Object.keys(ditemUpdates).reduce<{ [key: string]: AttributeName }>((accum, key) => {
                        if (key in dexistingItem) { // value may not existed in item being updated
                            accum[`#${key}`] = key
                        }
                        return accum
                    }, {}),
                    ExpressionAttributeValues: Object.assign(
                        {},
                        Object.keys(ditemUpdates).reduce<{ [key: string]: AttributeValue }>((accum, key) => {
                            if (key in dexistingItem) { // value may not existed in item being updated
                                accum[`:${key}`] = dexistingItem[key]
                            }
                            return accum
                        }, {})
                    ),
                }
            }
        ]
        // build all updates by also examining refkeys
        const allTransactWriteItemList = 
        itemTransactWriteItemList.concat(
        Object.keys(ditemUpdates).reduce<TransactWriteItem[]>((accum, key) => {
            if (__item_refkeys && __item_refkeys.map(r => r.key).indexOf(key) > -1 && ditemUpdates[key].S !== "__del__") { // changed/added ones
                process.env.DEBUG || console.log(`refkey ${key} marked for update`)
                accum.push({
                    Update: {
                        Key: { id: dexistingItemkey.id, meta: { S: refkeyitemmeta(existingItem,key) } },
                        TableName: DB_NAME,
                        ExpressionAttributeNames: "S" in ditemUpdates[key] ? { "#smetadata": "smetadata" } : { "#nmetadata": "nmetadata" },
                        ExpressionAttributeValues: "S" in ditemUpdates[key] ? { ":smetadata": ditemUpdates[key] } : { ":nmetadata": ditemUpdates[key] },
                        UpdateExpression: "S" in ditemUpdates[key] ? "set #smetadata = :smetadata" : "set #nmetadata = :nmetadata",
                        ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                    }
                })
            }
            if (__item_refkeys && __item_refkeys.map(r=>r.key).indexOf(key) > -1 && __item_refkeys.filter(r=>r.key === key)[0].unique === true) {
                if (dexistingItem[key]) { // if uq constraint already present, delete it
                    accum.push({
                        Delete: {
                            Key: toAttributeMap({id:`uq|${existingItem.item_type}}${key}`, meta: `${existingItem[key]}`}),
                            TableName: DB_NAME,
                            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                        }
                    })
                }
                if(ditemUpdates[key].S !== "__del__") {
                    accum.push({
                        Put: {
                            Item: toAttributeMap({id:`uq|${existingItem.item_type}}${key}`, meta: `${itemUpdates[key]}`}),
                            TableName: DB_NAME,
                            ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                        }
                    })
                }
            }
            return accum
        }, [])).concat(
        Object.keys(dexistingItem).reduce<TransactWriteItem[]>((accum, key) => {
            if (__item_refkeys && __item_refkeys.map(r=>r.key).indexOf(key) > -1 && Object.keys(ditemUpdates).indexOf(key) > -1 && ditemUpdates[key].S === "__del__") { // removed ones
                process.env.DEBUG || console.log(`refkey ${key} marked for delete`)
                accum.push({
                    Delete: {
                        Key: { id: dexistingItemkey.id, meta: { S: `${existingItem.item_type}}${key}` } },
                        TableName: DB_NAME,
                        ReturnValuesOnConditionCheckFailure: "ALL_OLD"
                    }
                })
            }
            return accum
        }, []))

        const params: TransactWriteItemsInput = {
            TransactItems: allTransactWriteItemList,
            ReturnConsumedCapacity: "TOTAL",
            ReturnItemCollectionMetrics: "SIZE",
            // ClientRequestToken: ringToken // TODO
        }

        // write item to the database
        dynamoDbClient.transactWriteItems(params, (error: AWSError, result: TransactWriteItemsOutput) => {
            // handle potential errors
            if (error) {
                throw error
                console.error(error)
                return reject(error)
            }

            console.log("====DDB==== TransactWriteItemsOutput: ", result)

            // create a response
            delete itemUpdates.revisions
            return resolve(Object.assign(existingItem, itemUpdates))
        })
    })