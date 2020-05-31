import { DynamoDB } from 'aws-sdk'
import { AttributeMap } from 'aws-sdk/clients/dynamodb';
import { MixinConstructor } from 'aarts-types/Mixin';
import { DynamoItem } from './BaseItemManager';

export const offline_options = {
    region: 'ddblocal',
    apiVersion: '2012-08-10',
    signatureVersion: 'v4',
    dynamoDbCrc32: false,
    endpoint: "http://localhost:8000"
}

export const dynamoDbClient: DynamoDB = process.env["AWS_SAM_LOCAL"] ? new DynamoDB(offline_options) : new DynamoDB();

export const DB_NAME = process.env["DB_NAME"] as string

export const dynamoDbConverterOptions: DynamoDB.Converter.ConverterOptions = {
    convertEmptyValues: true
};
export function removeEmpty(obj: Record<string, any>): object {
    return Object.keys(obj)
        .filter(k => obj[k] != null) // Remove undef. and null.
        .reduce(
            (newObj, k) =>
                typeof obj[k] === "object"
                    ? { ...newObj, [k]: removeEmpty(obj[k]) } // Recurse.
                    : { ...newObj, [k]: obj[k] }, // Copy value.
            {}
        )
}

export const versionString = (nr: number) => `v_${nr}`
export const deletedVersionString = (nr: number) => `d_${nr}`

export const uniqueitemrefkeyid = (item: DynamoItem, key: string) => `uq|${item.item_type}}${key}`

export const refkeyitemid = (item: DynamoItem, key: string) => `${item.item_type}}${key}`
export const refkeyitemmeta = (item: DynamoItem, key: string) => `${item.item_type}}${key}`
export const refkeyitemtype = (item: DynamoItem, key: string) => `ref_key|${item.item_type}}${key}`
export const refkeyitem = (item: DynamoItem, key: string) => Object.assign(
    {},
    item,
    {
        meta:  refkeyitemmeta(item, key),
        smetadata: typeof item[key] === "string" ? item[key] as string : undefined,
        nmetadata: typeof item[key] === "number" ? item[key] as number : undefined,
        item_type: refkeyitemtype(item, key)
    })




export function ensureOnlyNewKeyUpdates(existingItem: Record<string, any>, itemUpdates: Record<string, any>): object {
    return Object.keys(itemUpdates)
    // Remove those with same value, preserving whatever the revisions passed
        .filter(k => k === "revisions" || (itemUpdates[k] === "__del__" && existingItem[k]) ||  (itemUpdates[k] !== "__del__" && itemUpdates[k] != existingItem[k])) 
        .reduce(
            (newObj, k) =>
                typeof itemUpdates[k] === "object"
                    ? { ...newObj, [k]: ensureOnlyNewKeyUpdates(itemUpdates[k], existingItem[k]) } // Recurse.
                    : { ...newObj, [k]: itemUpdates[k] }, // Copy value.
            {}
        )
}

export const fromAttributeMap = <T>(item: AttributeMap | undefined) => DynamoDB.Converter.unmarshall(
    item || {},
    dynamoDbConverterOptions
) as T

export const toAttributeMap = <T>(item: T) => item && DynamoDB.Converter.marshall(
            removeEmpty(item),
            dynamoDbConverterOptions
        )

export const toAttributeMapArray = <T>(items: T[]) => items.reduce<DynamoDB.AttributeMap[]>(
    (prev: DynamoDB.AttributeMap[], item: T, index: number, array: T[]) => {
        prev.push(DynamoDB.Converter.marshall(
            removeEmpty(item),
            dynamoDbConverterOptions
        ))
        return prev
    }, [])

export const fromAttributeMapArray = <T>(attrMapArray: DynamoDB.AttributeMap[]) => attrMapArray.reduce<T[]>(
    (accum: T[], attrMap: AttributeMap) => {
        accum.push(DynamoDB.Converter.unmarshall(
            attrMap,
            dynamoDbConverterOptions
        ) as T)
        return accum
    }, [])