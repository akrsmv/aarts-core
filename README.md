# aarts-core
Aws artifacts(aarts) is a tiny tool for getting your existing domain logic to serverless / lambda / dynamodb

## initial conditions
- You have a set of domain entities, a business context, with a controllers / repositories / etc, and probably with bunch of domain validators in fornt of any CRUD/RPC logic.
  OR
- you start building an app from scratch
  
## The final idea
Implementing a simple interface will allow you to run your code in a aws lambda container,using the infinite-scaling dynamodb, as persistent storage. 

## Firts milestone implementation
Techniques used are 
- Injecting the domain logic into the lambda handler, simple IoC using the NodejsGlobal interface
- Decribing the domain entities, in a way, for aarts to know which one are of interest, so we can query over them (I call them refkeys)
- Typescript async generators allowing for reporting (notifying) over the execution progress
- Mixin patterns for merging / decorating each domain entitiy with necessary dynamo item keys. Thanks to [Nickolay Platonov](https://www.bryntum.com/blog/the-mixin-pattern-in-typescript-all-you-need-to-know/)
- Dynamodb transactional operations, allowing for a domain entity with up to 23 refkeys
- Queries: Mainly index preloading, implemented with 4 GSI used for describing all domain key properties of interest (currently 2 for string types and 2 of number types)
- Keeping a history of all CRUD mainpulations, using versioning

- Dynamodb trickery is mainly inspired by the talks of [Rick Houlihan](https://www.youtube.com/watch?v=HaEPXoXVf2k&t=1054s)
## Example usage
Example is with a airline management application, dealing with planes, airports, flights, pasaggers

TODO
- provide example domain
- describe refkeys 
- 

